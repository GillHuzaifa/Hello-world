import { HttpInterceptorFn, HttpErrorResponse } from '@angular/common/http';
import { PLATFORM_ID, inject } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';
import { environment } from '../../../environments/environment';
import { getAuthPageForUrl } from '../config/portal-detector';

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const platformId = inject(PLATFORM_ID);
  const isBrowser = isPlatformBrowser(platformId);

  const router = inject(Router);

  let apiReq = req;

  // rewrite relative /api URLs to the absolute backend URL
  if (!isBrowser && req.url.startsWith('/api')) {
    const absoluteUrl = `${environment.apiBaseUrl}${req.url.replace('/api/v1', '')}`;
    apiReq = req.clone({ url: absoluteUrl });
  }

  // Only attach token to our own API calls
  const isApiRequest = apiReq.url.startsWith('/api') ||
    apiReq.url.includes(environment.apiBaseUrl.replace('/api/v1', ''));

  if (!isApiRequest) {
    return next(apiReq);
  }

  let token: string | null = null;
  try {
    if (isBrowser) {
      token = localStorage.getItem('pulseq_token');
    }
  } catch { /* SSR-safe */ }

  // DEBUG: Log outgoing request headers and context to help diagnose 401s
  try {
    if (isBrowser) {
      const headerKeys = apiReq.headers?.keys ? apiReq.headers.keys() : [];
      const headerObj: Record<string, string[] | null> = {};
      for (const k of headerKeys) {
        headerObj[k] = apiReq.headers.getAll ? apiReq.headers.getAll(k) : (apiReq.headers.get(k) ? [apiReq.headers.get(k) as string] : null);
      }
      // eslint-disable-next-line no-console
      console.debug('[AuthInterceptor] Outgoing request', { method: apiReq.method, url: apiReq.url, isApiRequest, tokenPresent: !!token, headers: headerObj });
    }
  } catch (e) {
    // ignore debug failures
  }

  if (token) {
    const cloned = apiReq.clone({
      setHeaders: {
        Authorization: `Bearer ${token}`
      }
    });
    return next(cloned).pipe(
      catchError((error: HttpErrorResponse) => {
        // DEBUG: log request headers and error to help debugging 401s
        try {
          if (typeof window !== 'undefined') {
            const keys = cloned.headers?.keys ? cloned.headers.keys() : [];
            const h: Record<string, string[] | null> = {};
            for (const k of keys) {
              h[k] = cloned.headers.getAll ? cloned.headers.getAll(k) : (cloned.headers.get(k) ? [cloned.headers.get(k) as string] : null);
            }
            // eslint-disable-next-line no-console
            console.debug('[AuthInterceptor] 401 error context', { url: cloned.url, method: cloned.method, headers: h, error });
          }
        } catch (e) { }
        if (error.status === 401) {
          if (isBrowser) {
            try {
              localStorage.removeItem('pulseq_token');
              localStorage.removeItem('pulseq_user');
              localStorage.removeItem('hospitalId');
              localStorage.removeItem('doctorId');
            } catch (e) {
              console.error('Failed to clear localStorage:', e);
            }
          }
          const currentUrl = isBrowser ? window.location.pathname : '';
          const redirectPath = getAuthPageForUrl(currentUrl);
          router.navigate([redirectPath]).catch(err => {
            console.error(`Navigation to ${redirectPath} failed:`, err);
          });
          console.warn(`401 Unauthorized - Redirecting to ${redirectPath}`, error);
        }
        return throwError(() => error);
      })
    );
  }

  return next(apiReq);
};
