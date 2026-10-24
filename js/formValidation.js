export function validateAuthValues(values, signup = false) {
    const errors = {};
    if (!values.username.trim()) errors.username = 'Enter your username.';
    else if (signup && !/^[a-z0-9_-]{3,32}$/i.test(values.username.trim())) errors.username = 'Use 3–32 letters, numbers, underscores or hyphens.';
    if (!values.password) errors.password = 'Enter your password.';
    else if (signup && values.password.length < 8) errors.password = 'Use at least 8 characters for your password.';
    else if (signup && new TextEncoder().encode(values.password).length > 72) errors.password = 'Use no more than 72 UTF-8 bytes for your password.';
    else if (signup && !values.password.trim()) errors.password = 'Your password cannot contain only spaces.';
    if (signup && !values.confirmPassword) errors['confirm-password'] = 'Enter your password again.';
    else if (signup && values.confirmPassword !== values.password) errors['confirm-password'] = 'The passwords do not match.';
    return errors;
}

export function attachAuthValidation(form, signup = false) {
    form.noValidate = true;
    const fields = ['username', 'password', ...(signup ? ['confirm-password'] : [])];
    const messages = new Map();
    fields.forEach(id => {
        const field = form.querySelector(`#${id}`);
        const message = document.createElement('small');
        message.id = `${id}-error`;
        message.className = 'field-error';
        message.hidden = true;
        field.closest('.form-group').append(message);
        field.setAttribute('aria-describedby', [field.getAttribute('aria-describedby'), message.id].filter(Boolean).join(' '));
        messages.set(id, message);
        field.addEventListener('input', () => {
            field.removeAttribute('aria-invalid');
            message.hidden = true;
            message.textContent = '';
            const serverError = form.querySelector('#auth-error');
            serverError.classList.add('hidden');
        });
    });
    // Capture phase runs before the page's authentication submit handler.
    form.addEventListener('submit', event => {
        const errors = validateAuthValues({
            username: form.querySelector('#username').value,
            password: form.querySelector('#password').value,
            confirmPassword: form.querySelector('#confirm-password')?.value || ''
        }, signup);
        fields.forEach(id => {
            const field = form.querySelector(`#${id}`);
            const message = messages.get(id);
            message.textContent = errors[id] || '';
            message.hidden = !errors[id];
            field.setAttribute('aria-invalid', String(Boolean(errors[id])));
        });
        const first = Object.keys(errors)[0];
        if (first) {
            event.preventDefault();
            event.stopImmediatePropagation();
            form.querySelector(`#${first}`).focus();
        }
    }, true);
}
