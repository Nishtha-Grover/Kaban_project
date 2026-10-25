import test from 'node:test';
import assert from 'node:assert/strict';
import { validateDependencyGraph } from '../server/services/dependencies.js';
import { updateTask } from '../server/services/tasks.js';
import { Task } from '../server/models/Task.js';
const a = '507f1f77bcf86cd799439011', b = '507f1f77bcf86cd799439012';
test('rejects self, indirect cycles, duplicates and unavailable references', () => {
    const rows = [{_id:a,dependsOn:[]},{_id:b,dependsOn:[a]}];
    for (const deps of [[a],[b],[b,b],['507f1f77bcf86cd799439099']]) {
        assert.throws(()=>validateDependencyGraph(rows,a,deps),error=>Boolean(error.fields.dependsOn));
    }
});
test('accepts diamonds and edge removal without treating shared nodes as cycles', () => {
    const rows = [{_id:'a',dependsOn:[]},{_id:'b',dependsOn:['d']},{_id:'c',dependsOn:['d']},{_id:'d',dependsOn:[]}];
    assert.deepEqual(validateDependencyGraph(rows,'a',['b','c']),['b','c']);
    assert.deepEqual(validateDependencyGraph(rows,'b',[]),[]);
});
test('handles deep chains and rejects existing reachable corruption', () => {
    const rows = Array.from({length:20000},(_,i)=>({_id:String(i),dependsOn:i?[String(i-1)]:[]}));
    assert.deepEqual(validateDependencyGraph(rows,'new',['19999']),['19999']);
    assert.throws(()=>validateDependencyGraph(rows,'0',['19999']));
    assert.throws(()=>validateDependencyGraph([{_id:'b',dependsOn:['missing']}],'a',['b']));
});
test('update scopes graph lookup by owner and checks new dependencies for active tasks', async () => {
    const task = new Task({_id:a,owner:b,title:'Test',status:'inprogress',__v:0});
    task.save=async()=>{await task.validate();return task;};
    const tasks = {
        findOne:async()=>task,
        find:filter=>{assert.deepEqual(filter,{owner:b});return {select:()=>({lean:async()=>[{_id:a,dependsOn:[]},{_id:b,dependsOn:[]}]})};},
        countDocuments:async filter=>{assert.deepEqual(filter,{owner:b,_id:{$in:[b]},status:'done'});return 0;}
    };
    await assert.rejects(updateTask(b,a,{version:0,dependsOn:[b]},{tasks}),error=>error.status===409);
    const result = await updateTask(b,a,{version:0,status:'todo',dependsOn:[b]},{tasks});
    assert.deepEqual(result.dependsOn,[b]);
});
