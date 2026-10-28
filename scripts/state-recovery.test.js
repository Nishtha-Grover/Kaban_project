import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { SourceTextModule, SyntheticModule } from 'node:vm';

async function fixture() {
    let writes = 0, failReads = 0, lost = false, reject = false;
    let updateAttempts = 0, updateFailure = null, lostUpdate = false;
    const tasks = [];
    const module = new SourceTextModule(await readFile(new URL('../js/state.js', import.meta.url), 'utf8'));
    await module.link(async name => {
        const exports = name === './graph.js' ? { computeLockStates: () => ({}) }
            : name === './auth.js' ? { getWorkspaceIdentity: () => 'owner' }
            : name === './dependencyModel.js' ? { buildDependencyIndex: () => ({}) }
            : name === './taskApi.js' ? {
                loadDatabaseTasks: async () => tasks.map(task => structuredClone(task)),
                createDatabaseTask: async data => {
                    writes++;
                    if (reject) { reject = false; throw Object.assign(new Error('Invalid task'), {status:400}); }
                    const task = {id: String(writes), version: 0, ...data}; tasks.push(task);
                    failReads = 1;
                    if (lost) { lost = false; throw Object.assign(new Error('lost response'), {code:'NETWORK'}); }
                    return task;
                }, updateDatabaseTask: async (task, changes) => {
                    updateAttempts++;
                    if (updateFailure) {
                        const error = updateFailure; updateFailure = null; throw error;
                    }
                    const stored = tasks.find(item => item.id === task.id);
                    Object.assign(stored, changes); stored.version++; writes++;
                    if (lostUpdate) {
                        lostUpdate = false;
                        throw Object.assign(new Error('lost update response'), {code:'NETWORK'});
                    }
                    return structuredClone(stored);
                }, deleteDatabaseTask: () => {}
            } : { requestJson: async url => {
                if (failReads) { failReads--; throw Object.assign(new Error('HTTP 502'), {status:502}); }
                return url.includes('activities') ? {documents:[]} : {revision:writes, canUndo:true};
            }};
        return new SyntheticModule(Object.keys(exports), function () { for (const [k,v] of Object.entries(exports)) this.setExport(k,v); });
    });
    await module.evaluate();
    const state = module.namespace; await state.loadState();
    return {state, writes:()=>writes, lose:()=>{lost=true}, reject:()=>{reject=true},
        failUpdate:error=>{updateFailure=error}, loseUpdate:()=>{lostUpdate=true},
        updateAttempts:()=>updateAttempts};
}
test('saved task survives failed follow-up read and next edit needs no reload', async () => {
    const f=await fixture(); let updates=0; f.state.subscribe(()=>updates++);
    assert.equal(await f.state.addTask({title:'first'}),'1');
    assert.equal(f.state.getTask('1').title,'first');
    await f.state.addTask({title:'second'});
    assert.equal(f.writes(),2); assert.equal(updates,2);
});
test('lost write response reconciles the board without resending the write', async () => {
    const f=await fixture(); f.lose();
    await assert.rejects(f.state.addTask({title:'saved'}), /latest board is now synchronized/);
    assert.equal(f.state.getTask('1').title,'saved'); assert.equal(f.writes(),1);
    await f.state.addTask({title:'next'}); assert.equal(f.writes(),2);
});
test('validation rejection does not lock subsequent editing', async () => {
    const f=await fixture(); f.reject();
    await assert.rejects(f.state.addTask({title:''}), /Invalid task/);
    await f.state.addTask({title:'valid'}); assert.equal(f.state.getTask('2').title,'valid');
});
test('status move retries once after a server failure and updates the board', async () => {
    const f=await fixture(); const id=await f.state.addTask({title:'Study DSA', status:'todo'});
    f.failUpdate(Object.assign(new Error('Save task failed (HTTP 503).'), {status:503, code:'HTTP'}));
    await f.state.updateTaskStatus(id,'done');
    assert.equal(f.state.getTask(id).status,'done');
    assert.equal(f.updateAttempts(),2);
});
test('lost status response is reconciled without a duplicate write', async () => {
    const f=await fixture(); const id=await f.state.addTask({title:'Study DSA', status:'todo'});
    f.loseUpdate();
    await f.state.updateTaskStatus(id,'done');
    assert.equal(f.state.getTask(id).status,'done');
    assert.equal(f.updateAttempts(),1);
});
