import test from 'node:test';
import assert from 'node:assert/strict';
import { Task } from '../server/models/Task.js';
import { updateTask, deleteTask } from '../server/services/tasks.js';
const owner = '507f1f77bcf86cd799439011';
const id = '507f1f77bcf86cd799439012';
function fixture() {
    const task = new Task({ _id:id, owner, title:'Before', __v:2 });
    task.save = async () => { await task.validate(); return task; };
    const tasks = {
        findOne: async filter => { assert.deepEqual(filter,{_id:id,owner}); return task; },
        exists: async () => null,
        countDocuments: async () => 0,
        deleteOne: async filter => { assert.deepEqual(filter,{_id:id,owner,__v:2}); return {deletedCount:1}; }
    };
    return { task, tasks, attachments:{ exists:async()=>null } };
}
test('updates allowed fields on an owned task and validates before persistence', async () => {
    const f=fixture();
    assert.equal((await updateTask(owner,id,{version:2,title:' After '},f)).title,'After');
    await assert.rejects(updateTask(owner,id,{version:2,title:''},f),e=>e.status===400);
});
test('rejects spoofed owners, missing versions, stale versions and missing tasks', async () => {
    for(const body of [{version:2,owner,title:'x'},{title:'x'},{version:1,title:'x'}]) {
        await assert.rejects(updateTask(owner,id,body,fixture()));
    }
    const f=fixture(); f.tasks.findOne=async()=>null;
    await assert.rejects(updateTask(owner,id,{version:2,title:'x'},f),e=>e.status===404);
});
test('blocks unfinished prerequisites and reports save conflicts', async () => {
    const f=fixture(); f.task.dependsOn=[owner];
    await assert.rejects(updateTask(owner,id,{version:2,status:'done'},f),e=>e.status===409);
    f.task.save=async()=>{throw Object.assign(new Error(),{name:'VersionError'});};
    await assert.rejects(updateTask(owner,id,{version:2,title:'x'},f),e=>e.status===409);
});
test('delete uses ownership/version and refuses dependencies or attachments', async () => {
    await deleteTask(owner,id,{version:2},fixture());
    const dependent=fixture(); dependent.tasks.exists=async()=>({_id:owner});
    await assert.rejects(deleteTask(owner,id,{version:2},dependent),e=>e.status===409);
    const attached=fixture(); attached.attachments.exists=async()=>({_id:owner});
    await assert.rejects(deleteTask(owner,id,{version:2},attached),e=>e.status===409);
    const stale=fixture(); stale.tasks.deleteOne=async()=>({deletedCount:0});
    await assert.rejects(deleteTask(owner,id,{version:2},stale),e=>e.status===409);
});
