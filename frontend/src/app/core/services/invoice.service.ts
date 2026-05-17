import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { BehaviorSubject, Observable, forkJoin, map, of, switchMap, tap } from 'rxjs';
import { environment } from '../../../environments/environment';
import { Invoice, InvoiceListData, InvoiceListParams, ApiResponse } from '../../shared/models/invoice.model';

@Injectable({
    providedIn: 'root'
})
export class InvoiceService {
    private readonly API = `${environment.apiBaseUrl}/staff/portal/invoices`;
    private readonly invoiceCacheSubject = new BehaviorSubject<Invoice[]>([]);

    constructor(private http: HttpClient) { }

    private toNumber(value: unknown): number {
        const numeric = Number(value);
        return Number.isFinite(numeric) ? numeric : 0;
    }

    private toValidDate(value: unknown): string | undefined {
        if (!value) return undefined;
        const str = String(value).trim();
        if (!str || str === 'null' || str === 'undefined' || str === '') {
            return undefined;
        }

        // Handle DD-MM-YYYY format returned by backend (e.g. "14-05-2026")
        const ddmmyyyy = str.match(/^(\d{2})-(\d{2})-(\d{4})$/);
        if (ddmmyyyy) {
            const iso = `${ddmmyyyy[3]}-${ddmmyyyy[2]}-${ddmmyyyy[1]}`;
            const parsed = new Date(iso);
            if (!isNaN(parsed.getTime())) {
                return iso;
            }
            console.warn('[Invoice] Invalid DD-MM-YYYY date received:', value);
            return undefined;
        }

        // Fallback: try parsing as-is (ISO, etc.)
        const parsed = new Date(str);
        if (!isNaN(parsed.getTime())) {
            return str;
        }

        console.warn('[Invoice] Invalid date received:', value);
        return undefined;
    }

    private extractDateFromInvoiceNumber(invoiceNumber?: string): string | undefined {
        if (!invoiceNumber) return undefined;
        try {
            // Pattern: INV-20260514-0006 => extract 20260514
            const match = invoiceNumber.match(/(\d{8})/);
            if (!match || !match[1]) return undefined;
            const dateStr = match[1];
            const year = dateStr.substring(0, 4);
            const month = dateStr.substring(4, 6);
            const day = dateStr.substring(6, 8);

            const monthNum = parseInt(month, 10);
            const dayNum = parseInt(day, 10);
            if (monthNum < 1 || monthNum > 12 || dayNum < 1 || dayNum > 31) {
                return undefined;
            }

            const iso = `${year}-${month}-${day}`;
            const date = new Date(iso);
            if (isNaN(date.getTime())) {
                return undefined;
            }
            return iso;
        } catch {
            return undefined;
        }
    }

    private normalizeInvoice(invoice: Invoice): Invoice {
        // Parse created_at through toValidDate to handle DD-MM-YYYY
        let createdAt = this.toValidDate((invoice as any)?.created_at);

        // If created_at is still missing, try to extract from invoice_number
        if (!createdAt && invoice?.invoice_number) {
            const extracted = this.extractDateFromInvoiceNumber(invoice.invoice_number);
            if (extracted) {
                createdAt = extracted;
            }
        }

        const resolvedAt = this.toValidDate((invoice as any)?.resolved_at);
        const updatedAt = this.toValidDate((invoice as any)?.updated_at);

        return {
            ...invoice,
            subtotal: this.toNumber((invoice as any)?.subtotal),
            discount: this.toNumber((invoice as any)?.discount),
            tax: this.toNumber((invoice as any)?.tax),
            total: this.toNumber((invoice as any)?.total),
            amount_paid: this.toNumber((invoice as any)?.amount_paid),
            balance_due: this.toNumber((invoice as any)?.balance_due),
            item_count: this.toNumber((invoice as any)?.item_count),
            status: (invoice?.status || 'pending') as any,
            payment_method: (invoice?.payment_method || 'cash') as any,
            created_at: createdAt || undefined,
            updated_at: updatedAt || undefined,
            resolved_at: resolvedAt || undefined,
            items: Array.isArray(invoice?.items) ? invoice.items.map(item => ({
                ...item,
                quantity: this.toNumber((item as any)?.quantity),
                unit_price: this.toNumber((item as any)?.unit_price),
                discount: this.toNumber((item as any)?.discount),
                total: this.toNumber((item as any)?.total)
            })) : invoice?.items
        };
    }

    private normalizeInvoiceKey(invoice: Invoice): string {
        return invoice?.id || invoice?.invoice_number || `${invoice?.customer_name || 'invoice'}-${invoice?.created_at || ''}`;
    }

    private mergeInvoices(primary: Invoice[], secondary: Invoice[] = []): Invoice[] {
        const mergedByKey = new Map<string, Invoice>();
        const withoutKey: Invoice[] = [];

        for (const invoice of [...primary, ...secondary]) {
            if (!invoice) {
                continue;
            }

            const normalizedInvoice = this.normalizeInvoice(invoice);
            const key = this.normalizeInvoiceKey(normalizedInvoice);
            if (key) {
                mergedByKey.set(key, normalizedInvoice);
            } else {
                withoutKey.push(normalizedInvoice);
            }
        }

        return [...mergedByKey.values(), ...withoutKey];
    }

    private cacheInvoice(invoice: Invoice): void {
        const current = this.invoiceCacheSubject.value;
        const merged = this.mergeInvoices(current, [invoice]);
        this.invoiceCacheSubject.next(merged);
    }

    private cacheInvoiceRemoval(id: string): void {
        const filtered = this.invoiceCacheSubject.value.filter(invoice => invoice.id !== id);
        this.invoiceCacheSubject.next(filtered);
    }

    getInvoices(params?: InvoiceListParams): Observable<ApiResponse<InvoiceListData>> {
        let httpParams = new HttpParams();
        httpParams = httpParams.set('page', (params?.page || 1).toString());
        const pageSize = Math.min(params?.page_size || params?.per_page || 100, 100);
        httpParams = httpParams.set('per_page', pageSize.toString());
        httpParams = httpParams.set('page_size', pageSize.toString());
        if (params) {
            if (params.status) httpParams = httpParams.set('status', params.status);
            if (params.search) httpParams = httpParams.set('search', params.search);
            if (params.date_from) httpParams = httpParams.set('date_from', params.date_from);
            if (params.date_to) httpParams = httpParams.set('date_to', params.date_to);
            if (params.page) httpParams = httpParams.set('page', params.page.toString());
            if (params.page_size) httpParams = httpParams.set('page_size', params.page_size.toString());
            if (params.per_page) httpParams = httpParams.set('per_page', params.per_page.toString());
        }
        return this.http.get<ApiResponse<InvoiceListData>>(this.API, { params: httpParams });
    }

    getAllInvoices(params?: InvoiceListParams): Observable<ApiResponse<InvoiceListData>> {
        const normalized: InvoiceListParams = {
            ...(params || {}),
            page: 1,
            page_size: Math.min(params?.page_size || params?.per_page || 100, 100)
        };

        return this.getInvoices(normalized).pipe(
            switchMap((firstRes) => {
                const firstData: any = firstRes?.data || {};
                const firstInvoices: Invoice[] = firstData?.invoices || (Array.isArray(firstData) ? firstData : []);
                const totalPages = Number(firstData?.total_pages || 1);
                const mergedFirstInvoices = this.mergeInvoices(firstInvoices, this.invoiceCacheSubject.value);

                if (!Number.isFinite(totalPages) || totalPages <= 1) {
                    return of({
                        ...firstRes,
                        data: {
                            ...(firstData || {}),
                            invoices: mergedFirstInvoices,
                            total: firstData?.total || mergedFirstInvoices.length,
                            per_page: firstData?.per_page || mergedFirstInvoices.length,
                            page: firstData?.page || 1,
                            total_pages: firstData?.total_pages || 1,
                            counts: firstData?.counts || {
                                all: mergedFirstInvoices.length,
                                completed: mergedFirstInvoices.filter(i => i.status === 'completed').length,
                                pending: mergedFirstInvoices.filter(i => i.status === 'pending').length,
                                partial: mergedFirstInvoices.filter(i => i.status === 'partial').length,
                                cancelled: mergedFirstInvoices.filter(i => i.status === 'cancel').length
                            }
                        }
                    });
                }

                const pageRequests: Observable<ApiResponse<InvoiceListData>>[] = [];
                for (let page = 2; page <= totalPages; page++) {
                    pageRequests.push(this.getInvoices({ ...normalized, page }));
                }

                return forkJoin(pageRequests).pipe(
                    map((otherPages) => {
                        const all = [...firstInvoices];

                        for (const pageRes of otherPages) {
                            const pageData: any = pageRes?.data || {};
                            const pageInvoices: Invoice[] = pageData?.invoices || (Array.isArray(pageData) ? pageData : []);
                            all.push(...pageInvoices);
                        }

                        const merged = this.mergeInvoices(all, this.invoiceCacheSubject.value);
                        const mergedData: InvoiceListData = {
                            invoices: merged,
                            counts: firstData?.counts || {
                                all: merged.length,
                                completed: merged.filter(i => i.status === 'completed').length,
                                pending: merged.filter(i => i.status === 'pending').length,
                                partial: merged.filter(i => i.status === 'partial').length,
                                cancelled: merged.filter(i => i.status === 'cancel').length
                            },
                            total: firstData?.total || merged.length,
                            page: 1,
                            per_page: merged.length,
                            total_pages: 1
                        };

                        return {
                            ...firstRes,
                            data: mergedData
                        };
                    })
                );
            })
        );
    }

    getInvoice(id: string): Observable<ApiResponse<Invoice>> {
        return this.http.get<ApiResponse<Invoice>>(`${this.API}/${id}`);
    }

    createInvoice(payload: Partial<Invoice>): Observable<ApiResponse<Invoice>> {
        return this.http.post<ApiResponse<Invoice>>(this.API, payload).pipe(
            tap((response) => {
                if (response?.data) {
                    this.cacheInvoice(response.data);
                }
            })
        );
    }

    updateInvoice(id: string, payload: Partial<Invoice>): Observable<ApiResponse<Invoice>> {
        return this.http.put<ApiResponse<Invoice>>(`${this.API}/${id}`, payload).pipe(
            tap((response) => {
                if (response?.data) {
                    this.cacheInvoice(response.data);
                }
            })
        );
    }

    updateInvoiceStatus(id: string, newStatus: string): Observable<ApiResponse<any>> {
        const params = new HttpParams().set('new_status', newStatus);
        return this.http.patch<ApiResponse<any>>(`${this.API}/${id}/status`, null, { params });
    }

    deleteInvoice(id: string): Observable<ApiResponse<any>> {
        return this.http.delete<ApiResponse<any>>(`${this.API}/${id}`).pipe(
            tap(() => this.cacheInvoiceRemoval(id))
        );
    }

    /** Refresh the local invoice cache from the backend list response. */
    syncCacheFromList(invoices: Invoice[]): void {
        const merged = this.mergeInvoices(invoices, this.invoiceCacheSubject.value);
        this.invoiceCacheSubject.next(merged);
    }

    getTrash(hospitalId?: string): Observable<ApiResponse<Invoice[]>> {
        let params = new HttpParams();
        if (hospitalId) params = params.set('hospital_id', hospitalId);
        return this.http.get<ApiResponse<Invoice[]>>(`${this.API}/trash`, { params });
    }

    restoreInvoice(id: string): Observable<ApiResponse<any>> {
        return this.http.post<ApiResponse<any>>(`${this.API}/${id}/restore`, {});
    }
}