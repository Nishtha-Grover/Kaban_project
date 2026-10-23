import test from 'node:test';
import assert from 'node:assert/strict';
import { enforcePrerequisites } from '../server/services/prerequisites.js';
const owner = 'owner';
const task = { _id: 'task', status: 'todo', dependsOn: ['first', 'second'] };

test('blocks both active states until all owned prerequisites are done', async () => {
    for (const status of ['inprogress', 'done']) {
        const tasks = { countDocuments: async filter => {
            assert.deepEqual(filter, { owner, _id: {$in: ['first','second']}, status:'done' });
            return 1;
        } };
        await assert.rejects(enforcePrerequisites(tasks,owner,task,{status}),error=>error.status===409 && Boolean(error.fields.status));
        await enforcePrerequisites({countDocuments:async()=>2},owner,task,{status});
    }
});
test('missing or foreign prerequisites fail the owner-scoped completion count', async () => {
    await assert.rejects(enforcePrerequisites({countDocuments:async()=>0},owner,task,{status:'done'}),error=>error.status===409);
});
test('permits recovery to To do without requiring completed prerequisites', async () => {
    await enforcePrerequisites({ countDocuments:()=>assert.fail('Must not query') },owner,{...task,status:'inprogress'},{status:'todo'});
});
test('reopening a completed prerequisite is blocked by active dependents', async () => {
    for(const status of ['todo','inprogress']) {
        const tasks={exists:async filter=>{
            assert.deepEqual(filter,{owner,dependsOn:'task',status:{$in:['inprogress','done']}});
            return {_id:'dependent'};
        }};
        await assert.rejects(enforcePrerequisites(tasks,owner,{...task,status:'done',dependsOn:[]},{status}),error=>error.status===409);
        await enforcePrerequisites({exists:async()=>null},owner,{...task,status:'done',dependsOn:[]},{status});
    }
});
test('checks replacement dependencies and permits removing all prerequisites', async () => {
    await assert.rejects(enforcePrerequisites({countDocuments:async filter=>{
        assert.deepEqual(filter._id.$in,['new']); return 0;
    }},owner,{...task,status:'done'},{dependsOn:['new']}),error=>error.status===409);
    await enforcePrerequisites({},owner,{...task,status:'done'},{dependsOn:[]});
});
test('metadata updates cannot preserve a broken active task', async () => {
    await assert.rejects(enforcePrerequisites({countDocuments:async()=>0},owner,{...task,status:'inprogress'},{title:'Edited'}),error=>error.status===409);
});
test('invalid statuses fail before querying the database', async () => {
    await assert.rejects(enforcePrerequisites({},owner,task,{status:'invalid'}),error=>error.status===400);
});
