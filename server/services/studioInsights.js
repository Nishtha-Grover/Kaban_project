import mongoose from 'mongoose';
import { Task } from '../models/Task.js';

export function taskInsightsPipeline(owner) {
    if (typeof owner !== 'string' || !/^[a-f0-9]{24}$/i.test(owner)) throw new Error('Valid authenticated owner required.');
    // Aggregations do not automatically cast string IDs like ordinary queries.
    return [
        { $match: { owner: new mongoose.Types.ObjectId(owner) } },
        { $facet: {
            statuses: [{ $group: { _id: '$status', count: { $sum: 1 } } }, { $sort: { _id: 1 } }],
            priorities: [{ $group: { _id: '$priority', count: { $sum: 1 } } }, { $sort: { _id: 1 } }],
            categories: [{ $group: { _id: '$category', count: { $sum: 1 } } }, { $sort: { count: -1, _id: 1 } }, { $limit: 5 }],
            totals: [{ $group: { _id: null, total: { $sum: 1 },
                completed: { $sum: { $cond: [{ $eq: ['$status', 'done'] }, 1, 0] } },
                dependencyLinks: { $sum: { $size: { $ifNull: ['$dependsOn', []] } } }
            } }]
        } }
    ];
}

export async function studioInsights(owner, { tasks = Task } = {}) {
    const [rows, installed] = await Promise.all([
        tasks.aggregate(taskInsightsPipeline(owner)).option({ maxTimeMS: 5000 }), tasks.listIndexes()
    ]);
    const data = rows[0] ?? {};
    const totals = data.totals?.[0] ?? { total: 0, completed: 0, dependencyLinks: 0 };
    const declared = tasks.schema.indexes();
    const sameKey = (a, b) => JSON.stringify(Object.entries(a)) === JSON.stringify(Object.entries(b));
    return {
        total: totals.total, completed: totals.completed, dependencyLinks: totals.dependencyLinks,
        completionPercent: totals.total ? Math.round(totals.completed / totals.total * 100) : 0,
        statuses: data.statuses ?? [], priorities: data.priorities ?? [], categories: data.categories ?? [],
        indexes: declared.map(([key, options]) => ({ key, unique: Boolean(options.unique),
            installed: installed.some(index => sameKey(index.key, key) && Boolean(index.unique) === Boolean(options.unique)),
            purpose: Object.hasOwn(key, 'status') ? 'Supports owner-scoped status filters.' : 'Supports owner-scoped due-date queries.'
        })),
        stages: ['$match: your owner ID', '$facet: parallel summaries', '$group: counts and totals', '$sort + $limit: top five categories']
    };
}
