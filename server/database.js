import mongoose from 'mongoose';
import { User } from './models/User.js';

let ready = false;
export function databaseReady() {
    return ready && mongoose.connection.readyState === 1;
}
export async function connectDatabase(uri) {
    if (!uri) return false;
    await mongoose.connect(uri, { serverSelectionTimeoutMS: 5000, bufferCommands: false });
    // Ensure duplicate usernames cannot race during registration.
    await User.createIndexes();
    ready = true;
    return true;
}
export async function disconnectDatabase() {
    ready = false;
    await mongoose.disconnect();
}
