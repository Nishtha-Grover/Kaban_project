import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { SourceTextModule, SyntheticModule } from 'node:vm';

async function fixture() {
    let writes = 0, failReads = 0, lost = false, reject = false;
    const tasks = [];
    const module = new SourceTextModule(await readFile(new URL('../js/state.js', import.meta.url), 'utf8'));
    await module.link(async name => {
        const exports = name === './graph.js' ? { computeLockStates: () => ({}) }
            : name === './auth.js' ? { getWorkspaceIdentity: () => 'owner' }
            : name === './dependencyModel.js' ? { buildDependencyIndex: () => ({}) }
            : name === './taskApi.js' ? {
                loadDatabaseTasks: async () => [...tasks],
                createDatabaseTask: async data => {
                    writes++;
                    if (reject) { reject = false; throw Object.assign(new Error('Invalid task'), {status:400}); }
                    const task = {id: String(writes), ...data}; tasks.push(task);
                    failReads = 1;
                    if (lost) { lost = false; throw Object.assign(new Error('lost response'), {code:'NETWORK'}); }
                    return task;
                }, updateDatabaseTask: () => {}, deleteDatabaseTask: () => {}
            } : { requestJson: async url => {
                if (failReads) { failReads--; throw Object.assign(new Error('HTTP 502'), {status:502}); }
                return url.includes('activities') ? {documents:[]} : {revision:writes, canUndo:true};
            }};
        return new SyntheticModule(Object.keys(exports), function () { for (const [k,v] of Object.entries(exports)) this.setExport(k,v); });
    });
    await module.evaluate();
    const state = module.namespace; await state.loadState();
    return {state, writes:()=>writes, lose:()=>{lost=true}, reject:()=>{reject=true}};
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
