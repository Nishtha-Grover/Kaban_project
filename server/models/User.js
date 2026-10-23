import mongoose from 'mongoose';

function publicUser(document, result) {
    delete result.passwordHash;
    delete result.__v;
    delete result.workspaceRevision;
    return result;
}

const userSchema = new mongoose.Schema({
    workspaceRevision: { type: Number, default: 0, select: false },
    username: {
        type: String,
        required: [true, 'Username is required.'],
        trim: true,
        lowercase: true,
        minlength: 3,
        maxlength: 32,
        match: [/^[a-z0-9_-]+$/, 'Use letters, numbers, underscores or hyphens for your username.'],
        immutable: true
    },
    displayName: {
        type: String,
        trim: true,
        maxlength: 80,
        default: ''
    },
    passwordHash: {
        type: String,
        required: [true, 'A password hash is required.'],
        select: false,
        // Registration must bcrypt-hash the password before assigning this field.
        // This validates the encoded format, not the strength of the password.
        match: [/^\$2[aby]\$(0[4-9]|[12][0-9]|3[01])\$[./A-Za-z0-9]{53}$/, 'A valid bcrypt password hash is required.']
    }
}, {
    timestamps: true,
    strict: 'throw',
    toJSON: { transform: publicUser },
    toObject: { transform: publicUser }
});

// Database uniqueness is enforced by an index, not by Mongoose validation.
// Registration must handle duplicate-key errors once the database is connected.
userSchema.index({ username: 1 }, { unique: true });

export const User = mongoose.models.User || mongoose.model('User', userSchema);
