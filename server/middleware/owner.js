// Future Task and Attachment models use an `owner` ObjectId field.
// Mount after requireAuth. Non-owned and missing documents both return 404.
export function requireOwnedDocument(model, { param = 'id', target = 'ownedDocument' } = {}) {
    return async (req, res, next) => {
        if (!req.user?.id) {
            return res.status(401).json({ error: { code: 'UNAUTHENTICATED', message: 'Please log in to continue.' } });
        }
        const id = req.params[param];
        if (typeof id !== 'string' || !/^[a-f0-9]{24}$/i.test(id)) {
            return res.status(400).json({ error: { code: 'INVALID_ID', message: 'A valid document ID is required.' } });
        }
        try {
            const document = await model.findOne({ _id: id, owner: req.user.id });
            if (!document) {
                return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Document not found.' } });
            }
            res.locals[target] = document;
            next();
        } catch (error) { next(error); }
    };
}
