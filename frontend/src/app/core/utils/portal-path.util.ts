import { environment } from '../../../environments/environment';

export function pharmacyPath(path: string): string {
    const cleanPath = path.startsWith('/') ? path.slice(1) : path;

    if (typeof window !== 'undefined') {
        const hostname = window.location.hostname.toLowerCase();
        const parts = hostname.split('.');

        if (parts.includes('pharmacy')) {
            return `/${cleanPath}`;
        }
    }

    return `/staff/pharmacy/${cleanPath}`;
}

export function doctorPath(path: string): string {
    const cleanPath = path.startsWith('/') ? path.slice(1) : path;

    if (typeof window !== 'undefined') {
        const hostname = window.location.hostname.toLowerCase();
        const parts = hostname.split('.');

        if (parts.includes('doctor')) {
            return `/${cleanPath}`;
        }
    }

    return `/staff/doctor/${cleanPath}`;
}

export function adminPath(path: string): string {
    const cleanPath = path.startsWith('/') ? path.slice(1) : path;

    if (typeof window !== 'undefined') {
        const hostname = window.location.hostname.toLowerCase();
        const parts = hostname.split('.');

        if (parts.includes('admin')) {
            return `/${cleanPath}`;
        }
    }

    return `/staff/admin/${cleanPath}`;
}