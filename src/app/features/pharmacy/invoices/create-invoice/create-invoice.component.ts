import { ChangeDetectionStrategy, ChangeDetectorRef, Component, DestroyRef, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { CardModule } from 'primeng/card';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { InputNumberModule } from 'primeng/inputnumber';
import { DropdownModule } from 'primeng/dropdown';
import { ToastModule } from 'primeng/toast';
import { TooltipModule } from 'primeng/tooltip';
import { BreadcrumbModule } from 'primeng/breadcrumb';
import { PanelModule } from 'primeng/panel';
import { TableModule } from 'primeng/table';
import { AutoCompleteModule } from 'primeng/autocomplete';
import { InputTextareaModule } from 'primeng/inputtextarea';
import { FloatLabelModule } from 'primeng/floatlabel';
import { MessageService } from 'primeng/api';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { InvoiceService } from '../../../../core/services/invoice.service';
import { pharmacyPath } from '../../../../core/utils/portal-path.util';
import { Invoice, InvoiceItem } from '../../../../shared/models/invoice.model';
import { PharmacySidebarComponent } from '../../shared/components/pharmacy-sidebar/pharmacy-sidebar.component';
import { PharmacyService } from '../../../../core/services/pharmacy.service';
import { Medicine } from '../../../../shared/models/medicine.model';

/** Shape used by the medicine autocomplete dropdown */
interface MedicineSuggestion {
    label: string;
    medicine: Medicine;
}

@Component({
    selector: 'app-create-invoice',
    standalone: true,
    imports: [
        CommonModule, RouterModule, FormsModule,
        CardModule, ButtonModule, InputTextModule, InputNumberModule,
        DropdownModule, ToastModule, TooltipModule, BreadcrumbModule,
        PanelModule, TableModule, AutoCompleteModule, InputTextareaModule,
        FloatLabelModule,
        PharmacySidebarComponent
    ],
    providers: [MessageService],
    templateUrl: './create-invoice.component.html',
    styleUrls: ['./create-invoice.component.css'],
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class CreateInvoiceComponent implements OnInit {

    // ── Mode flags ──────────────────────────────────────────────────────────
    isEditMode = false;
    isViewMode = false;
    invoiceId: string | null = null;
    isSubmitting = false;

    // ── Customer ────────────────────────────────────────────────────────────
    customerName = 'Walk in customer';
    customerSuggestions: string[] = [];

    // ── Invoice items ───────────────────────────────────────────────────────
    invoiceItems: InvoiceItem[] = [];

    // ── Totals ──────────────────────────────────────────────────────────────
    subtotal = 0;
    itemDiscountTotal = 0;
    taxAmount = 0;
    taxPercent = 0;
    discount = 0;
    totalDiscount = 0;
    totalAmount = 0;

    // ── Payment / status ────────────────────────────────────────────────────
    paymentMethod = 'cash';
    status = 'pending';
    notes = '';

    // ── Medicine autocomplete ───────────────────────────────────────────────
    /** Full inventory list loaded once on init */
    medicines: Medicine[] = [];
    /** Filtered list fed to each item's p-autoComplete */
    medicineSuggestions: MedicineSuggestion[] = [];

    // ── Static option lists ─────────────────────────────────────────────────
    breadcrumbs: any[] = [];

    paymentMethods = [
        { label: 'Cash', value: 'cash' },
        { label: 'Card', value: 'card' },
        { label: 'Online', value: 'online' },
        { label: 'Other', value: 'other' }
    ];

    statuses = [
        { label: 'Pending', value: 'pending' },
        { label: 'Completed', value: 'completed' },
        { label: 'Partial', value: 'partial' },
        { label: 'Cancel', value: 'cancel' }
    ];

    private readonly destroyRef = inject(DestroyRef);

    constructor(
        private invoiceService: InvoiceService,
        private pharmacyService: PharmacyService,
        private messageService: MessageService,
        private router: Router,
        private route: ActivatedRoute,
        private cdr: ChangeDetectorRef
    ) { }

    // ── Lifecycle ───────────────────────────────────────────────────────────

    ngOnInit(): void {
        this.route.queryParams
            .pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe(params => {
                if (params['id']) {
                    this.invoiceId = params['id'];
                    const mode = params['mode'] || 'edit';
                    this.isEditMode = mode === 'edit';
                    this.isViewMode = mode === 'view';
                    this.loadInvoice(params['id']);
                } else {
                    this.isEditMode = false;
                    this.isViewMode = false;
                    this.initializeNewInvoice();
                }
                this.cdr.markForCheck();
            });

        this.loadMedicinesFromInventory();
    }

    // ── Load inventory medicines ────────────────────────────────────────────

    private loadMedicinesFromInventory(): void {
        const user = this.getCurrentUser();
        const hospitalId = user?.hospital_id || user?.hospitalId || '';

        this.pharmacyService.fetchAllMedicines(hospitalId)
            .pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe({
                next: (raw: any[]) => {
                    this.medicines = raw.map(m => this.pharmacyService.apiToMedicine(m));
                    this.cdr.markForCheck();
                },
                error: (err) => {
                    console.warn('[CreateInvoice] Could not load medicine list:', err);
                }
            });
    }

    // ── Medicine autocomplete handlers ──────────────────────────────────────

    searchMedicine(event: any, item: InvoiceItem): void {
        const q = (event.query || '').trim().toLowerCase();

        if (!q) {
            this.medicineSuggestions = this.medicines
                .slice(0, 50)
                .map(m => this.toSuggestion(m));
        } else {
            this.medicineSuggestions = this.medicines
                .filter(m =>
                    m.name.toLowerCase().includes(q) ||
                    (m.genericName || '').toLowerCase().includes(q) ||
                    (m.salt || '').toLowerCase().includes(q)
                )
                .slice(0, 50)
                .map(m => this.toSuggestion(m));
        }

        this.cdr.markForCheck();
    }

    onMedicineSelected(event: any, item: InvoiceItem): void {
        const suggestion: MedicineSuggestion = event.value ?? event;
        const med = suggestion?.medicine;
        if (!med) return;

        item.product_name = med.name;
        item.product_id = med.productId ? parseInt(med.productId, 10) : null;
        item.unit_price = med.sellingPrice ?? 0;
        item.discount = 0;

        this.recalculate();
        this.cdr.markForCheck();
    }

    private toSuggestion(m: Medicine): MedicineSuggestion {
        const salt = m.genericName || m.salt || '';
        return {
            label: salt ? `${m.name} — ${salt}` : m.name,
            medicine: m
        };
    }

    // ── Customer autocomplete ───────────────────────────────────────────────

    searchCustomer(event: any): void {
        const q = (event.query || '').toLowerCase();
        const base = ['Walk in customer', 'John Doe', 'Jane Smith', 'Ahmed Khan'];
        this.customerSuggestions = q
            ? base.filter(n => n.toLowerCase().includes(q))
            : base;
    }

    // ── Invoice loading (edit / view mode) ──────────────────────────────────

    loadInvoice(id: string): void {
        this.invoiceService.getInvoice(id).subscribe({
            next: (res) => {
                const invoice = res.data;
                this.customerName = invoice.customer_name;
                this.invoiceItems = (invoice.items || []).map(item => ({
                    ...item,
                    discount: 0
                }));
                this.discount = invoice.discount || 0;
                this.taxPercent = invoice.tax || 0;
                this.paymentMethod = invoice.payment_method;
                this.status = invoice.status;
                this.notes = invoice.notes || '';
                this.recalculate();

                if (this.isViewMode) {
                    setTimeout(() => this.disableFormFields(), 100);
                }
                this.cdr.markForCheck();
            },
            error: (err) => {
                this.messageService.add({
                    severity: 'error',
                    summary: 'Error',
                    detail: err?.error?.message || 'Failed to load invoice'
                });
            }
        });
    }

    disableFormFields(): void {
        const inputs = document.querySelectorAll(
            '.page-wrapper input, .page-wrapper textarea'
        );
        inputs.forEach((input: any) => {
            input.setAttribute('readonly', 'readonly');
            input.setAttribute('disabled', 'disabled');
            input.style.backgroundColor = '#f3f4f6';
            input.style.cursor = 'not-allowed';
        });

        const primeElements = document.querySelectorAll(
            '.page-wrapper .p-dropdown, ' +
            '.page-wrapper .p-autocomplete, ' +
            '.page-wrapper .p-inputnumber'
        );
        primeElements.forEach((el: any) => {
            el.style.pointerEvents = 'none';
            el.style.opacity = '0.7';
            el.style.backgroundColor = '#f3f4f6';
            const innerInput = el.querySelector('input');
            if (innerInput) {
                innerInput.setAttribute('readonly', 'readonly');
                innerInput.setAttribute('disabled', 'disabled');
                innerInput.style.backgroundColor = '#f3f4f6';
                innerInput.style.cursor = 'not-allowed';
            }
        });

        const addItemBtn = document.querySelector('.page-wrapper .add-item-btn') as HTMLElement;
        if (addItemBtn) addItemBtn.style.display = 'none';

        const deleteButtons = document.querySelectorAll('.page-wrapper .delete');
        deleteButtons.forEach((btn: any) => { btn.style.display = 'none'; });
    }

    // ── Invoice initialisation ──────────────────────────────────────────────

    initializeNewInvoice(): void {
        this.customerName = 'Walk in customer';
        this.invoiceItems = [];
        this.discount = 0;
        this.taxPercent = 0;
        this.paymentMethod = 'cash';
        this.status = 'pending';
        this.notes = '';
        this.addItem();
    }

    // ── Item management ─────────────────────────────────────────────────────

    addItem(): void {
        this.invoiceItems.push({
            product_id: null,
            product_name: '',
            quantity: 0,
            unit_price: 0,
            discount: 0,
            total: 0
        });
        this.cdr.markForCheck();
    }

    removeItem(index: number): void {
        this.invoiceItems.splice(index, 1);
        this.recalculate();
    }

    onItemSelected(item: InvoiceItem): void {
        this.recalculate();
    }

    // ── Recalculation ───────────────────────────────────────────────────────

    recalculate(): void {
        let grossSubtotal = 0;

        this.invoiceItems.forEach(item => {
            const quantity = Number(item.quantity) || 0;
            const unitPrice = Number(item.unit_price) || 0;
            item.total = quantity * unitPrice;
            grossSubtotal += item.total;
        });

        this.subtotal = grossSubtotal;
        this.itemDiscountTotal = 0;
        this.totalDiscount = Number(this.discount) || 0;

        const taxableAmount = this.subtotal - this.totalDiscount;
        this.taxAmount = Math.max(0, taxableAmount) * ((Number(this.taxPercent) || 0) / 100);
        this.totalAmount = Math.max(0, taxableAmount + this.taxAmount);

        this.cdr.markForCheck();
    }

    // ── Validation ──────────────────────────────────────────────────────────

    validateForm(): boolean {
        if (!this.customerName?.trim()) {
            this.messageService.add({
                severity: 'warn',
                summary: 'Validation Error',
                detail: 'Customer name is required'
            });
            return false;
        }

        if (this.invoiceItems.length === 0) {
            this.messageService.add({
                severity: 'warn',
                summary: 'Validation Error',
                detail: 'At least one item is required'
            });
            return false;
        }

        for (let i = 0; i < this.invoiceItems.length; i++) {
            const item = this.invoiceItems[i];
            const unitPrice = Number(item.unit_price) || 0;
            const itemDiscount = Number(item.discount) || 0;

            if (unitPrice > 0 && itemDiscount === unitPrice) {
                this.messageService.add({
                    severity: 'error',
                    summary: 'Validation Error',
                    detail: `Item ${i + 1}: Discount cannot be equal to the unit price`
                });
                return false;
            }
        }

        const invoiceDiscount = Number(this.discount) || 0;
        if (this.subtotal > 0 && invoiceDiscount === this.subtotal) {
            this.messageService.add({
                severity: 'error',
                summary: 'Validation Error',
                detail: 'Invoice discount cannot be equal to the subtotal amount'
            });
            return false;
        }

        if (!this.status) {
            this.messageService.add({
                severity: 'warn',
                summary: 'Validation Error',
                detail: 'Status is required'
            });
            return false;
        }

        return true;
    }

    // ── Payload builder ─────────────────────────────────────────────────────

    private getTodayISO(): string {
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }

    private getCurrentUser(): any {
        try {
            return JSON.parse(localStorage.getItem('pulseq_user') || '{}');
        } catch {
            return {};
        }
    }

    buildPayload(): Partial<Invoice> {
        const user = this.getCurrentUser();
        const hospitalId = user?.hospital_id || user?.hospitalId || '';

        return {
            customer_name: this.customerName,
            payment_method: this.paymentMethod as any,
            status: this.status as any,
            notes: this.notes,
            discount: this.discount,
            tax: this.taxPercent,
            subtotal: this.subtotal,
            total: this.totalAmount,
            created_at: this.getTodayISO(),
            hospital_id: hospitalId || undefined,
            items: this.invoiceItems.map(item => ({
                product_id: item.product_id,
                product_name: item.product_name,
                product_code: item.product_code ?? null,
                quantity: item.quantity,
                unit_price: item.unit_price,
                discount: 0,
                total: (Number(item.quantity) || 0) * (Number(item.unit_price) || 0)
            }))
        };
    }

    // ── Submit actions ──────────────────────────────────────────────────────

    submit(): void {
        if (!this.validateForm()) return;
        this.isSubmitting = true;
        this.cdr.markForCheck();

        const payload = this.buildPayload();

        if (this.isEditMode && this.invoiceId) {
            this.invoiceService.updateInvoice(this.invoiceId, payload).subscribe({
                next: () => {
                    this.messageService.add({
                        severity: 'success',
                        summary: 'Success',
                        detail: 'Invoice updated successfully'
                    });
                    setTimeout(() => this.router.navigate([pharmacyPath('invoices')]), 1500);
                },
                error: (err) => {
                    this.isSubmitting = false;
                    this.messageService.add({
                        severity: 'error',
                        summary: 'Error',
                        detail: err?.error?.message || 'Failed to update invoice'
                    });
                    this.cdr.markForCheck();
                }
            });
        } else {
            this.invoiceService.createInvoice(payload).subscribe({
                next: () => {
                    this.messageService.add({
                        severity: 'success',
                        summary: 'Success',
                        detail: 'Invoice created successfully'
                    });
                    setTimeout(() => this.router.navigate([pharmacyPath('invoices')]), 1500);
                },
                error: (err) => {
                    this.isSubmitting = false;
                    this.messageService.add({
                        severity: 'error',
                        summary: 'Error',
                        detail: err?.error?.message || 'Failed to create invoice'
                    });
                    this.cdr.markForCheck();
                }
            });
        }
    }

    submitAndCreateAnother(): void {
        if (!this.validateForm()) return;
        this.isSubmitting = true;
        this.cdr.markForCheck();

        this.invoiceService.createInvoice(this.buildPayload()).subscribe({
            next: () => {
                this.messageService.add({
                    severity: 'success',
                    summary: 'Success',
                    detail: 'Invoice created. Ready to create another.'
                });
                this.initializeNewInvoice();
                this.isSubmitting = false;
                this.cdr.markForCheck();
            },
            error: (err) => {
                this.isSubmitting = false;
                this.messageService.add({
                    severity: 'error',
                    summary: 'Error',
                    detail: err?.error?.message || 'Failed to create invoice'
                });
                this.cdr.markForCheck();
            }
        });
    }

    cancel(): void {
        this.router.navigate([pharmacyPath('invoices')]);
    }
}