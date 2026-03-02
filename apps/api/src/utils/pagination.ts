export interface ListQuery {
    page?: number;
    limit?: number;
    sort?: string;
    order?: 'asc' | 'desc';
    search?: string;
    filters?: Record<string, any>;
    q?: string; // Legacy support
}

export interface ParsedListQuery {
    page: number;
    limit: number;
    sort?: string;
    order: 'asc' | 'desc';
    search?: string;
    filters?: any;
}

export function parseListQuery(query: any): ParsedListQuery {
    const page = Math.max(1, parseInt(query.page as string, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(query.limit as string, 10) || 20));
    const order = query.order === 'asc' ? 'asc' : 'desc';
    const search = (query.search || query.q) as string | undefined;

    let filters: any;
    if (query.filters) {
        try {
            filters = typeof query.filters === 'string' ? JSON.parse(query.filters) : query.filters;
        } catch (e) {
            filters = query.filters;
        }
    }

    return {
        page,
        limit,
        sort: query.sort as string | undefined,
        order,
        search,
        filters,
    };
}

export interface PaginatedResponse<T> {
    data: T[];
    pagination: {
        page: number;
        limit: number;
        total: number;
        totalPages: number;
        hasNext: boolean;
        hasPrev: boolean;
    };
}

export function buildPaginatedResponse<T>(data: T[], total: number, page: number, limit: number): PaginatedResponse<T> {
    const totalPages = Math.ceil(total / limit);
    return {
        data,
        pagination: {
            page,
            limit,
            total,
            totalPages,
            hasNext: page < totalPages,
            hasPrev: page > 1,
        }
    };
}
