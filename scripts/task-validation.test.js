import test from 'node:test';
import assert from 'node:assert/strict';
import { createTask, updateTask } from '../server/services/tasks.js';
import { Task } from '../server/models/Task.js';
const owner = '507f1f77bcf86cd799439011';
const id = '507f1f77bcf86cd799439012';

test('collects field errors without silently casting request values', async () => {
    await assert.rejects(createTask(owner, { title: 123, tags: 'exam', dueDate: null }), error => {
        assert.equal(error.status, 400);
        assert.deepEqual(Object.keys(error.fields).sort(), ['dueDate', 'tags', 'title']);
        return true;
    });
});
test('returns matching Mongoose field errors for creation and update', async () => {
    const invalid = { title: ' ', priority: 'unsupported', dueDate: '2026-02-30' };
    const task = new Task({ _id:id, owner, title:'Original', __v:0 });
    task.save = async () => { await task.validate(); return task; };
    const operations = [
        () => createTask(owner, invalid),
        () => updateTask(owner, id, {version:0,...invalid}, {tasks:{findOne:async()=>task}})
    ];
    for(const operation of operations) await assert.rejects(operation(), error => {
        assert.equal(error.fields.title, 'This field is required.');
        assert.equal(error.fields.priority, 'Choose a supported value.');
        assert.equal(error.fields.dueDate, 'Use a real date in YYYY-MM-DD format.');
        assert.ok(!error.message.includes('unsupported'));
        return true;
    });
});
test('unsupported fields and empty patches fail before database access', async () => {
    for(const input of [{version:0},{version:0,owner},{version:0,$set:{title:'Injected'}}]) {
        await assert.rejects(updateTask(owner,id,input,{tasks:{findOne:()=>assert.fail('Must not query')}}),error=>Boolean(error.fields.body));
    }
});
