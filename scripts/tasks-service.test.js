import test from 'node:test';
import assert from 'node:assert/strict';
import { createTask, listTasks } from '../server/services/tasks.js';

const owner = '507f1f77bcf86cd799439011';
const prerequisite = '507f1f77bcf86cd799439012';

test('creates a normalized owned task and returns the public shape', async () => {
    const result = await createTask(owner, { title: ' Assignment ' }, { saveTask: async task => {
        assert.equal(String(task.owner), owner); assert.equal(task.status, 'todo'); return task;
    } });
    assert.equal(result.title, 'Assignment');
    assert.equal(result.owner, undefined);
    assert.equal(result.id.length, 24);
});
test('rejects owner injection, invalid types and invalid model data before saving', async () => {
    for (const input of [{title:'Test',owner:prerequisite}, {title:12}, {title:'Test',status:'done'},
        {title:'Test',tags:[12]}, {title:'Test',dueDate:'2026-02-30'}, {title:'Test',dependsOn:['invalid']}]) {
        await assert.rejects(createTask(owner, input, { saveTask: () => assert.fail('Must not save') }), error => error.code === 'TASK_VALIDATION');
    }
});
test('requires prerequisites to exist in the same workspace', async () => {
    const input = { title: 'Test', dependsOn: [prerequisite] };
    await assert.rejects(createTask(owner, input, {
        countDependencies: async filter => { assert.equal(filter.owner, owner); return 0; },
        saveTask: () => assert.fail('Must not save')
    }), /unavailable/);
    const result = await createTask(owner, input, { countDependencies: async () => 1, saveTask: async task => task });
    assert.deepEqual(result.dependsOn, [prerequisite]);
});
test('listing scopes both queries and bounds pagination', async () => {
    const chain = { sort(value) { assert.deepEqual(value,{createdAt:-1,_id:-1}); return this; },
        skip(value) { assert.equal(value,10); return this; }, limit(value) { assert.equal(value,10); return this; }, lean: async()=>[] };
    const tasks = { find(filter) { assert.deepEqual(filter,{owner,status:'todo'}); return chain; },
        countDocuments: async filter => { assert.deepEqual(filter,{owner,status:'todo'}); return 15; } };
    assert.deepEqual(await listTasks(owner,{page:'2',limit:'10',status:'todo'},{tasks}),{tasks:[],page:2,limit:10,total:15,totalPages:2});
    for (const query of [{owner:prerequisite},{limit:'101'},{page:'-1'},{status:{$ne:'done'}}]) {
        await assert.rejects(listTasks(owner,query,{tasks}),error=>error.code==='TASK_VALIDATION');
    }
});
