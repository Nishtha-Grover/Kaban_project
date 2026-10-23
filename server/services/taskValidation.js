const textFields = ['title', 'description', 'status', 'priority', 'category', 'dueDate'];

export function taskValidationError(fields) {
    return Object.assign(new Error('Check the highlighted task fields.'), {
        status: 400, code: 'TASK_VALIDATION', fields
    });
}

export function validateTaskInput(input, { update = false } = {}) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) {
        throw taskValidationError({ body: 'Provide a task JSON object.' });
    }
    const fields = Object.create(null);
    const allowed = [...textFields, 'tags', ...(update ? ['version'] : ['dependsOn'])];
    if (Object.keys(input).some(key => !allowed.includes(key))) fields.body = 'Remove unsupported task fields.';
    for (const field of textFields) {
        if (Object.hasOwn(input, field) && typeof input[field] !== 'string') fields[field] = 'Must be text.';
    }
    for (const field of ['tags', 'dependsOn']) {
        if (Object.hasOwn(input, field) && (!Array.isArray(input[field]) || input[field].some(value => typeof value !== 'string'))) {
            fields[field] = 'Must be an array of strings.';
        }
    }
    if (!update && input.status !== undefined && input.status !== 'todo') fields.status = 'New tasks must start in To do.';
    if (Array.isArray(input.dependsOn)) {
        if (input.dependsOn.length > 100) fields.dependsOn = 'Use at most 100 prerequisites.';
        else if (input.dependsOn.some(id => typeof id !== 'string' || !/^[a-f0-9]{24}$/i.test(id))) fields.dependsOn = 'Use valid task IDs.';
    }
    if (update && !Object.keys(input).some(key => key !== 'version')) fields.body = 'Provide at least one field to update.';
    if (Object.keys(fields).length) throw taskValidationError(fields);
}

export function mapTaskValidation(error) {
    if (error.name !== 'ValidationError') return error;
    const fields = Object.create(null);
    for (const [path, issue] of Object.entries(error.errors)) {
        const field = path.split('.')[0];
        // Never echo cast errors containing submitted objects or internal model details.
        fields[field] ??= issue.name === 'CastError' ? 'Invalid field value.'
            : issue.kind === 'required' ? 'This field is required.'
            : issue.kind === 'enum' ? 'Choose a supported value.'
            : issue.kind === 'maxlength' ? 'This field is too long.'
            : issue.kind === 'minlength' ? 'This field is too short.'
            : ({ dueDate: 'Use a real date in YYYY-MM-DD format.', tags: 'Use at most six distinct, nonempty tags of up to 30 characters.',
                dependsOn: 'Use distinct valid prerequisite IDs, excluding this task.' }[field] || 'Invalid field value.');
    }
    return taskValidationError(fields);
}
