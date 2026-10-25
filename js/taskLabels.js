export function parseTags(value) {
    const seen = new Set();
    return value.split(',').map(tag => tag.trim().replace(/^#+/, '').trim()).filter(tag => {
        const key = tag.toLowerCase();
        if (!tag || seen.has(key)) return false;
        seen.add(key);
        return true;
    });
}

export const priorityGuidance = {
    low: 'Flexible timing — fit this around your main commitments.',
    medium: 'A normal part of your plan.',
    high: 'Important work that deserves attention soon.',
    urgent: 'Needs immediate attention. Keep this label for true priorities.'
};
