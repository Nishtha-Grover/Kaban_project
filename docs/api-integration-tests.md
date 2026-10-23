# Live API integration tests — stage 63

Run `npm run test:api:auth` with Node and MongoDB (`mongod`) installed. If mongod
is not on PATH, set MONGOD_BINARY to its absolute executable path. No additional
npm dependency, Atlas account or existing project database is required.

The fixture creates a fresh temporary directory, starts an isolated single-node
replica set on a dynamically selected localhost port, initializes indexes and
starts the real Express application on another temporary port. Its URI and JWT
secret exist only in the test process. It does not read `.env` or connect to the
normal project database. Cleanup closes servers, stops the child mongod, removes
only the temporary directory it created and restores process environment values.
The filesystem audit may append test metadata to the Git-ignored `logs/` folder.

The six scenarios exercise real HTTP requests and MongoDB persistence:

- Registration validation, bcrypt verification and duplicate usernames.
- Invalid credentials, valid login, HTTP-only/SameSite cookies and tampered tokens.
- Task creation, listing and editing, plus transactional Activity writes.
- Invalid fields, stale versions, cross-site writes and unchanged audit counts.
- A second account cannot list, edit or delete the first account's task.
- Task deletion preserves audit history; logout expires the browser cookie.

Logout clears the cookie; it does not revoke an already-copied JWT. The final
unauthenticated check omits the cleared cookie, as a browser would.

Verified locally on 24 October 2026: all six scenarios passed (Node reports seven
tests including their parent). Initial sandbox socket denial was resolved by
granting network access for the isolated localhost test servers. This result
does not verify production HTTPS, Atlas, deployment or frontend integration.
Dependency/upload integration tests are stage 64.

## Dependency and upload integration — stage 64

Run `npm run test:api:files`. It reuses the isolated replica-set fixture and tests:

- Cycle rejection, prerequisite completion, blocked reopening and deletion.
- Two simultaneous opposite dependency updates: only one succeeds, leaving no cycle.
- Real multipart upload persistence across metadata, bytes and activity records.
- Disallowed extensions, spoofed content, empty/oversized files, wrong multipart
  fields, foreign owners and unauthenticated requests without unwanted records.
- Download bytes, attachment/nosniff headers, HEAD responses and owner isolation.
- Deliberate failure after an upload inside a transaction: file bytes, metadata
  and activity are all rolled back in the actual database.

Verified locally on 24 October 2026: all six scenarios passed (seven tests
including the parent). Network permission was needed for temporary localhost
listeners. The fixture cleaned up its database after the run. These results
validate real MongoDB/HTTP behavior locally, not Atlas or deployed hosting limits.
