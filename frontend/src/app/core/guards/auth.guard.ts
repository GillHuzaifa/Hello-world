import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { AuthService } from '../services/auth.service';
import { detectPortal, getAuthPageForUrl } from '../config/portal-detector';

export const authGuard: CanActivateFn = (route, state) => {
    const router = inject(Router);
    const authService = inject(AuthService);
    const platformId = inject(PLATFORM_ID);
    const isBrowser = isPlatformBrowser(platformId);

    if (isBrowser) {
        const token = localStorage.getItem('pulseq_token');
        const user = localStorage.getItem('pulseq_user');

        // ✅ Token is the primary auth indicator
        // User data may not always be available (e.g., pharmacy endpoints)
        // but a valid token is sufficient for access
        if (token) {
            // Optionally validate user data if present
            if (user) {
                try {
                    JSON.parse(user);
                } catch {
                    // User data is corrupted but token exists, allow access
                    // (user data will be refreshed on next API call)
                }
            }
            return true;
        }

        return router.parseUrl(getAuthPageForUrl(state.url));
    }

    // ✅ FIX: During SSR (server-side), allow rendering to proceed.
    // The client-side auth check will handle the actual guard logic
    // after hydration, preventing reload-to-auth flicker.
    return true;
};