import test from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { Task } from '../server/models/Task.js';

const owner = new mongoose.Types.ObjectId();
const make = overrides => new Task({ owner, title: '  Finish assignment  ', ...overrides });

test('task defaults and ownership match the board model', async () => {
    const task = make();
    await task.validate();
    assert.equal(task.title, 'Finish assignment');
    assert.equal(task.status, 'todo');
    assert.equal(task.priority, 'medium');
    assert.equal(task.dueDate, '');
    assert.deepEqual([...task.tags], []);
    assert.equal(String(task.owner), String(owner));
    assert.equal(Task.schema.path('owner').options.immutable, true);
});
test('rejects missing owner, empty title, invalid enums and oversized text', async () => {
    for (const input of [{ owner: null }, { title: ' ' }, { title: 'a'.repeat(161) },
        { description: 'a'.repeat(3001) }, { status: 'unknown' }, { priority: 'unknown' }]) {
        await assert.rejects(make(input).validate());
    }
});
test('dates retain calendar meaning and reject impossible dates', async () => {
    await make({ dueDate: '2028-02-29' }).validate();
    for (const dueDate of ['2027-02-29', '2026-04-31', 'tomorrow', '2026-10-23T00:00:00Z', null]) {
        await assert.rejects(make({ dueDate }).validate());
    }
});
test('validates tag count, length and case-insensitive duplicates', async () => {
    const task = make({ tags: [' DSA ', 'exam'] });
    await task.validate();
    assert.deepEqual([...task.tags], ['DSA', 'exam']);
    for (const tags of [[''], ['a'.repeat(31)], ['Exam', 'exam'], Array.from({length:7},(_,i)=>String(i)), null]) {
        await assert.rejects(make({ tags }).validate());
    }
});
test('dependencies reject self references, duplicates and invalid IDs', async () => {
    const task = make();
    task.dependsOn = [task._id];
    await assert.rejects(task.validate());
    const dependency = new mongoose.Types.ObjectId();
    await make({ dependsOn: [dependency] }).validate();
    for (const dependsOn of [[dependency, dependency], ['invalid'], [null], null]) {
        await assert.rejects(make({ dependsOn }).validate());
    }
});
test('declares references, timestamps, concurrency protection and owner indexes', () => {
    assert.equal(Task.schema.path('owner').options.ref, 'User');
    assert.equal(Task.schema.path('dependsOn').caster.options.ref, 'Task');
    assert.ok(Task.schema.path('createdAt'));
    assert.ok(Task.schema.path('updatedAt'));
    assert.equal(Task.schema.options.optimisticConcurrency, true);
    assert.ok(Task.schema.indexes().every(([keys]) => keys.owner === 1));
    assert.throws(() => make({ unexpected: true }), /strict/i);
});
