import test from 'node:test';
import assert from 'node:assert/strict';
import { registerUser } from '../server/services/registration.js';

test('hashes before persistence and returns only public fields', async () => {
    let stored;
    const user = await registerUser({ username: ' Student ', password: 'test password', role: 'admin' }, {
        hash: async password => { assert.equal(password, 'test password'); return 'hashed-fixture'; },
        users: { create: async record => { stored = record; return { ...record, _id: '123' }; } }
    });
    assert.equal(stored.passwordHash, 'hashed-fixture');
    assert.equal(stored.password, undefined);
    assert.equal(stored.role, undefined);
    assert.deepEqual(user, { id: '123', username: 'student', displayName: '' });
});
test('rejects invalid input before hashing', async () => {
    for (const input of [null, [], {}, {username:'student',password:'short'}, {username:'student',password:'🌱'.repeat(19)}, {username:'bad name',password:'password123'}]) {
        await assert.rejects(registerUser(input, {hash:()=>assert.fail('Must not hash invalid input')}), error=>error.status===400);
    }
});
test('handles the database duplicate-key race', async () => {
    await assert.rejects(registerUser({username:'student',password:'password123'}, {
        hash:async()=>'hash',users:{create:async()=>{throw {code:11000};}}
    }), error=>error.status===409 && error.code==='USERNAME_TAKEN');
});
test('bcrypt hash verifies without storing plaintext', async () => {
    const { default: bcrypt } = await import('bcrypt');
    let stored;
    await registerUser({username:'student',password:'test password'}, {users:{create:async record=>{stored=record;return {...record,_id:'123'};}}});
    assert.ok(await bcrypt.compare('test password',stored.passwordHash));
    assert.equal(await bcrypt.compare('wrong password',stored.passwordHash),false);
});
