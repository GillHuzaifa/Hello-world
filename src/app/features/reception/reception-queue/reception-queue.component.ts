import { Component, OnInit, OnDestroy, HostListener, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { TableModule } from 'primeng/table';
import { ButtonModule } from 'primeng/button';
import { CardModule } from 'primeng/card';
import { ToastModule } from 'primeng/toast';
import { DialogModule } from 'primeng/dialog';
import { InputTextModule } from 'primeng/inputtext';
import { TooltipModule } from 'primeng/tooltip';
import { DropdownModule } from 'primeng/dropdown';
import { MessageService, ConfirmationService } from 'primeng/api';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { QueueService } from '../../../core/services/queue.service';
import { DoctorService } from '../../../core/services/doctor.service';
import { ReceptionService } from '../../../core/services/reception.service';
import { AuthService } from '../../../core/services/auth.service';
import { Token } from '../../../shared/models/token.model';
import { Doctor } from '../../../shared/models/doctor.model';
import { ReceptionSidebarComponent } from '../shared/components/reception-sidebar/reception-sidebar.component';
import { NotificationService } from '../../../core/services/notification.service';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';

interface Patient {
    id?: string;
    token: string;
    name: string;
    age?: number;
    gender?: string;
    reason: string;
    status?: 'pending' | 'completed' | 'skipped';
    department?: string;
    phone?: string;
    mrn?: string;
    doctorId?: string;
    doctorName?: string;
    consultationFee?: number | null;
    sessionFee?: number | null;
    totalFee?: number | null;
}

export type SortField = 'token' | 'name' | 'status' | 'department' | 'doctor';
export type SortDir = 'asc' | 'desc';

@Component({
    selector: 'app-reception-queue',
    standalone: true,
    imports: [
        CommonModule, FormsModule, TableModule, ButtonModule, CardModule,
        ToastModule, DialogModule, InputTextModule, TooltipModule,
        DropdownModule, ConfirmDialogModule, ReceptionSidebarComponent
    ],
    providers: [MessageService, ConfirmationService],
    templateUrl: './reception-queue.component.html',
    styleUrls: ['./reception-queue.component.css']
})
export class ReceptionQueueComponent implements OnInit, OnDestroy {

    // ── Filter panel state ────────────────────────────────────────────────────
    filterPanelOpen = false;

    // Active filters
    selectedStatus: string | null = null;
    selectedDoctorId: string | null = null;
    selectedDepartment: string | null = null;
    searchText = '';

    // Sort
    sortField: SortField = 'token';
    sortDir: SortDir = 'asc';

    sortOptions: { label: string; value: SortField }[] = [
        { label: 'Token', value: 'token' },
        { label: 'Name', value: 'name' },
        { label: 'Status', value: 'status' },
        { label: 'Department', value: 'department' },
        { label: 'Doctor', value: 'doctor' },
    ];

    // Dropdown option lists
    statuses = [
        { label: 'All statuses', value: null },
        { label: 'Pending', value: 'pending' },
        { label: 'Completed', value: 'completed' },
        { label: 'Skipped', value: 'skipped' }
    ];

    genderOptions = [
        { label: 'Male', value: 'Male' },
        { label: 'Female', value: 'Female' },
        { label: 'Other', value: 'Other' }
    ];

    departments: { label: string; value: string }[] = [];
    availableDoctors: Doctor[] = [];

    get doctorOptions(): { label: string; value: string | null }[] {
        return [
            { label: 'Any doctor', value: null },
            ...this.availableDoctors.map(d => ({ label: d.name, value: d.id }))
        ];
    }

    get departmentOptions(): { label: string; value: string | null }[] {
        return [
            { label: 'All departments', value: null },
            ...this.departments
        ];
    }

    /** Count of active filters (excluding search & sort) for the badge */
    get activeFilterCount(): number {
        return [this.selectedStatus, this.selectedDoctorId, this.selectedDepartment]
            .filter(v => v !== null && v !== undefined).length;
    }

    // ── Data ─────────────────────────────────────────────────────────────────
    tokens: Patient[] = [];
    filteredTokens: Patient[] = [];
    private allDoctorsCache: Doctor[] = [];
    private destroy$ = new Subject<void>();

    // ── Dialog / nav state ───────────────────────────────────────────────────
    editVisible = false;
    viewVisible = false;
    deleteConfirmVisible = false;
    editModel: Partial<Patient> | null = null;
    viewModel: Patient | null = null;
    deleteModel: Patient | null = null;
    currentNav: 'dashboard' | 'queue' | 'manage-doctors' = 'queue';
    sidebarOpen = false;

    constructor(
        private messageService: MessageService,
        private route: ActivatedRoute,
        private router: Router,
        private confirmationService: ConfirmationService,
        private queueService: QueueService,
        private doctorService: DoctorService,
        private receptionService: ReceptionService,
        private authService: AuthService,
        private notificationService: NotificationService,
        private elRef: ElementRef
    ) { }

    ngOnInit() {
        this.doctorService.getDoctorsObservable().subscribe(docs => {
            this.allDoctorsCache = docs;
        });
        this.loadQueue();
        this.loadDepartments();
        this.doctorService.doctors$
            .pipe(takeUntil(this.destroy$))
            .subscribe(doctors => {
                this.availableDoctors = doctors.filter(d => d.available);
            });
    }

    ngOnDestroy(): void {
        this.destroy$.next();
        this.destroy$.complete();
    }

    // ── Close panel when clicking outside ────────────────────────────────────
    @HostListener('document:click', ['$event'])
    onDocumentClick(event: MouseEvent) {
        if (!this.filterPanelOpen) return;
        const panel = this.elRef.nativeElement.querySelector('.filter-panel-wrapper');
        if (panel && !panel.contains(event.target as Node)) {
            this.filterPanelOpen = false;
        }
    }

    toggleFilterPanel(event: MouseEvent) {
        event.stopPropagation();
        this.filterPanelOpen = !this.filterPanelOpen;
    }

    clearAllFilters() {
        this.selectedStatus = null;
        this.selectedDoctorId = null;
        this.selectedDepartment = null;
        this.sortField = 'token';
        this.sortDir = 'asc';
        this.filter();
    }

    applyAndClose() {
        this.filterPanelOpen = false;
        this.filter();
    }

    setSortField(field: SortField) {
        if (this.sortField === field) {
            this.sortDir = this.sortDir === 'asc' ? 'desc' : 'asc';
        } else {
            this.sortField = field;
            this.sortDir = 'asc';
        }
        this.filter();
    }

    // ── Helpers ───────────────────────────────────────────────────────────────
    private getHospitalId(): string {
        const user: any = this.authService.getCurrentUser();
        return user?.hospitalId || user?.hospital_id || '';
    }

    private loadDepartments(): void {
        const hospitalId = this.getHospitalId();
        this.doctorService.listDepartments(hospitalId)
            .pipe(takeUntil(this.destroy$))
            .subscribe({
                next: (res: any) => {
                    const raw: any[] = res?.data || res || [];
                    this.departments = raw.map(d => ({
                        label: d.name || d.label || d,
                        value: d.name || d.value || d
                    }));
                },
                error: () => {
                    this.departments = [{ label: 'General Medicine', value: 'General Medicine' }];
                }
            });
    }

    private parseAge(raw: any): number {
        if (raw === null || raw === undefined || raw === '') return 0;
        let str = raw.toString().trim();
        str = str.replace(/^(age|patient|p|age-|patient_)?[-_]*/i, '');
        const cleaned = str.replace(/[^0-9]/g, '');
        const parsed = parseInt(cleaned, 10);
        return isNaN(parsed) || parsed < 0 ? 0 : Math.min(parsed, 150);
    }

    private mapStatus(raw: string): 'pending' | 'completed' | 'skipped' {
        const s = (raw || '').toLowerCase();
        if (s === 'done' || s === 'completed') return 'completed';
        if (s === 'skipped') return 'skipped';
        return 'pending';
    }

    /** Format fee value — returns 'Rs. X' or '—' if null/undefined/0 */
    formatFee(value: number | null | undefined): string {
        if (value === null || value === undefined) return '—';
        return `Rs. ${value.toLocaleString('en-PK')}`;
    }

    // ── Queue loading ─────────────────────────────────────────────────────────
    loadQueue(): void {
        this.receptionService.getQueue(this.getHospitalId())
            .pipe(takeUntil(this.destroy$))
            .subscribe({
                next: (res: any) => {
                    const rawTokens = res?.data || res?.queue || res || [];
                    const tokens = Array.isArray(rawTokens) ? rawTokens : [];
                    this.tokens = tokens.map((t: any) => {
                        let doctorName = '';
                        if (t.doctor_id || t.doctorId) {
                            const dId = t.doctor_id || t.doctorId;
                            let doc = this.availableDoctors.find(d => d.id === dId);
                            if (!doc && this.allDoctorsCache.length) {
                                doc = this.allDoctorsCache.find(d => d.id === dId);
                            }
                            doctorName = doc ? doc.name : (t.doctor_name || t.doctorName || 'Any');
                        } else {
                            doctorName = t.doctor_name || t.doctorName || '';
                        }
                        return {
                            id: t.token_id || t.id || t.tokenId || '',
                            token: t.token_number || t.tokenNumber || t.token || 'T-00',
                            name: t.patient_name || t.patientName || t.patientId || 'Unknown',
                            age: this.parseAge(t.patient_age ?? t.patientAge ?? t.age),
                            gender: t.patient_gender || t.patientGender || t.gender || 'Unknown',
                            reason: t.reason || t.reason_for_visit || t.reasonForVisit || '',
                            status: this.mapStatus(t.status || t.state || ''),
                            department: t.department || 'General Medicine',
                            phone: t.patient_phone || t.phone || t.patientPhone || '',
                            mrn: t.mrn || t.patient_id || '-',
                            doctorId: t.doctor_id || t.doctorId,
                            doctorName,
                            consultationFee: t.consultation_fee ?? t.consultationFee ?? null,
                            sessionFee: t.session_fee ?? t.sessionFee ?? null,
                            totalFee: t.total_fee ?? t.totalFee ?? null,
                        };
                    });
                    this.filter();
                },
                error: (err) => {
                    console.error('Failed to load queue from API', err);
                    this.queueService.getQueue()
                        .pipe(takeUntil(this.destroy$))
                        .subscribe(tokens => {
                            this.tokens = tokens.map((t: Token) => {
                                let doctorName = '';
                                if (t.doctorId) {
                                    let doc = this.availableDoctors.find(d => d.id === t.doctorId);
                                    if (!doc && this.allDoctorsCache.length) {
                                        doc = this.allDoctorsCache.find(d => d.id === t.doctorId);
                                    }
                                    doctorName = doc ? doc.name : '';
                                }
                                return {
                                    token: t.tokenNumber,
                                    name: t.patientName || t.patientId,
                                    age: this.parseAge(t.patientAge),
                                    gender: (t.patientGender as any) || 'Unknown',
                                    reason: (t.reasonForVisit as any) || '',
                                    status: this.mapStatus(t.status || ''),
                                    department: t.department,
                                    phone: t.patientPhone,
                                    mrn: (t as any).mrn || (t as any).patient_id || '-',
                                    doctorId: t.doctorId,
                                    doctorName,
                                    consultationFee: null,
                                    sessionFee: null,
                                    totalFee: null,
                                };
                            });
                            this.filter();
                        });
                }
            });
    }

    // ── Core filter + sort ────────────────────────────────────────────────────
    filter() {
        let skipped = this.tokens.filter(t => t.status === 'skipped');
        let nonSkipped = this.tokens.filter(t => t.status !== 'skipped');

        if (this.selectedStatus === 'skipped') {
            skipped = this.applyCommonFilters(skipped);
            this.filteredTokens = this.applySort(this.applySearch(skipped));
            return;
        }

        if (this.selectedStatus) {
            nonSkipped = nonSkipped.filter(t => t.status === this.selectedStatus);
        }

        skipped = this.applyCommonFilters(skipped);
        nonSkipped = this.applyCommonFilters(nonSkipped);

        if (this.searchText.trim()) {
            const q = this.searchText.toLowerCase();
            skipped = skipped.filter(t =>
                t.name.toLowerCase().includes(q) || t.token.toLowerCase().includes(q));
            nonSkipped = nonSkipped.filter(t =>
                t.name.toLowerCase().includes(q) || t.token.toLowerCase().includes(q));
        }

        const sortedSkipped = this.applySort(skipped);
        const sortedNonSkipped = this.applySort(nonSkipped);
        this.filteredTokens = [...sortedSkipped, ...sortedNonSkipped];
    }

    private applyCommonFilters(list: Patient[]): Patient[] {
        if (this.selectedDoctorId) {
            list = list.filter(t => t.doctorId === this.selectedDoctorId);
        }
        if (this.selectedDepartment) {
            list = list.filter(t => (t.department || '') === this.selectedDepartment);
        }
        return list;
    }

    private applySearch(list: Patient[]): Patient[] {
        if (!this.searchText.trim()) return list;
        const q = this.searchText.toLowerCase();
        return list.filter(t =>
            t.name.toLowerCase().includes(q) || t.token.toLowerCase().includes(q));
    }

    private applySort(list: Patient[]): Patient[] {
        return [...list].sort((a, b) => {
            let valA = '';
            let valB = '';
            switch (this.sortField) {
                case 'token':
                    const numA = parseInt((a.token || '').replace(/\D/g, ''), 10) || 0;
                    const numB = parseInt((b.token || '').replace(/\D/g, ''), 10) || 0;
                    return this.sortDir === 'asc' ? numA - numB : numB - numA;
                case 'name': valA = a.name || ''; valB = b.name || ''; break;
                case 'status': valA = a.status || ''; valB = b.status || ''; break;
                case 'department': valA = a.department || ''; valB = b.department || ''; break;
                case 'doctor': valA = a.doctorName || ''; valB = b.doctorName || ''; break;
            }
            const cmp = valA.localeCompare(valB);
            return this.sortDir === 'asc' ? cmp : -cmp;
        });
    }

    onSearchChange(text: string) { this.searchText = text; this.filter(); }
    onFilterChange() { this.filter(); }
    save() { this.messageService.add({ severity: 'success', summary: 'Saved', detail: 'Queue saved (in-memory)' }); }

    // ── Row actions ───────────────────────────────────────────────────────────
    view(row: Patient) { this.viewModel = row; this.viewVisible = true; }

    edit(row: Patient) {
        this.editModel = { ...row, age: this.parseAge(row.age) };
        this.editVisible = true;
    }

    onAgeChange(value: any): void {
        if (this.editModel) this.editModel.age = this.parseAge(value);
    }

    saveEdit() {
        if (!this.editModel) return;
        const idx = this.tokens.findIndex(t => t.token === this.editModel!.token);
        if (idx < 0) return;
        const mapped = { ...this.tokens[idx], ...(this.editModel as Patient) };
        if (!mapped.id) {
            this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Token ID not found' });
            this.editVisible = false;
            return;
        }
        const safeAge = this.parseAge(this.editModel.age);
        const updated: any = {
            patient_name: mapped.name,
            patient_age: safeAge,
            patient_gender: mapped.gender,
            department: mapped.department,
            reason: mapped.reason,
        };
        if (mapped.phone) updated.patient_phone = mapped.phone;

        this.receptionService.updateToken(mapped.id, updated)
            .pipe(takeUntil(this.destroy$))
            .subscribe({
                next: () => {
                    this.tokens[idx] = { ...this.tokens[idx], ...(this.editModel as Patient), age: safeAge };
                    this.filter();
                    this.messageService.add({ severity: 'success', summary: 'Updated', detail: `${mapped.token} saved successfully` });
                    setTimeout(() => this.loadQueue(), 800);
                },
                error: () => {
                    this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Failed to update token' });
                }
            });
        this.editVisible = false;
    }

    delete(row: Patient) { this.deleteModel = row; this.deleteConfirmVisible = true; }

    confirmDelete() {
        if (!this.deleteModel) return;
        if (!this.deleteModel.id) {
            this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Token ID not found' });
            this.deleteConfirmVisible = false;
            return;
        }
        const tokenId = this.deleteModel.id;
        const tokenToDelete = this.deleteModel;
        const tokenIndex = this.filteredTokens.findIndex(t => t.id === tokenId);
        if (tokenIndex > -1) this.filteredTokens.splice(tokenIndex, 1);

        this.receptionService.deleteToken(tokenId)
            .pipe(takeUntil(this.destroy$))
            .subscribe({
                next: () => {
                    this.messageService.add({ severity: 'success', summary: 'Deleted', detail: `${tokenToDelete.token} removed from queue`, life: 3000 });
                    this.loadQueue();
                },
                error: (err) => {
                    console.error('Failed to delete token:', err);
                    this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Failed to delete token' });
                    this.loadQueue();
                }
            });
        this.deleteConfirmVisible = false;
    }

    skipToken(row: Patient): void {
        if (!row.id) {
            this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Token ID not found, cannot skip.', life: 3000 });
            return;
        }
        this.receptionService.skipToken(row.id)
            .pipe(takeUntil(this.destroy$))
            .subscribe({
                next: () => {
                    this.messageService.add({ severity: 'warn', summary: 'Skipped', detail: `${row.token} has been skipped`, life: 3000 });
                    this.notificationService.sendTokenSkipped(row.token, 'reception');
                    const idx = this.tokens.findIndex(t => t.id === row.id);
                    if (idx !== -1) {
                        this.tokens[idx] = { ...this.tokens[idx], status: 'skipped' };
                        this.filter();
                    }
                    setTimeout(() => this.loadQueue(), 500);
                },
                error: (err) => {
                    console.error('Failed to skip token:', err);
                    this.messageService.add({ severity: 'error', summary: 'Error', detail: err?.error?.message || 'Failed to skip token', life: 3000 });
                }
            });
    }

    reAddToken(row: Partial<Patient>) {
        if (!row.id) {
            this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Patient ID not found', life: 3000 });
            return;
        }
        this.receptionService.reAddToken(row.id)
            .pipe(takeUntil(this.destroy$))
            .subscribe({
                next: (response: any) => {
                    const updatedStatus = response?.data?.status;
                    if (updatedStatus && updatedStatus.toLowerCase() !== 'skipped') {
                        const arr3 = this.queueService.getQueueSnapshot();
                        const found3 = arr3.find(x => x.tokenNumber === row.token);
                        if (found3) this.queueService.updateTokenStatus(found3.id, 'WAITING');
                        this.messageService.add({ severity: 'success', summary: 'Re-added', detail: `${row.token} added back to queue`, life: 3000 });
                    } else {
                        this.messageService.add({
                            severity: 'error', summary: 'Backend Error',
                            detail: `Failed to update token status. Status still: ${updatedStatus}. Contact admin.`, life: 5000
                        });
                    }
                    setTimeout(() => this.loadQueue(), 500);
                },
                error: (err) => {
                    console.error('Failed to re-add token:', err);
                    this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Failed to re-add patient to queue', life: 3000 });
                }
            });
    }

    // ── Nav & misc ────────────────────────────────────────────────────────────
    navigateTo(page: 'dashboard' | 'queue' | 'manage-doctors') {
        this.currentNav = page;
        this.sidebarOpen = false;
        if (page === 'dashboard') this.router.navigate(['../dashboard'], { relativeTo: this.route });
        else if (page === 'queue') this.router.navigate(['../queue'], { relativeTo: this.route });
        else if (page === 'manage-doctors') this.router.navigate(['../manage-doctors'], { relativeTo: this.route });
    }

    toggleSidebar(): void { this.sidebarOpen = !this.sidebarOpen; }

    // ── PRINT ─────────────────────────────────────────────────────────────────
    printSlip(slip: Patient): void {
        // Remove any existing injected elements first
        const existingContainer = document.getElementById('token-slip-print-container');
        const existingStyle = document.getElementById('token-slip-print-style');
        if (existingContainer) existingContainer.remove();
        if (existingStyle) existingStyle.remove();

        // Inject print-only styles into the current page's <head>
        const styleEl = document.createElement('style');
        styleEl.id = 'token-slip-print-style';
        styleEl.innerHTML = `
            @media print {
                body > *:not(#token-slip-print-container) {
                    display: none !important;
                    visibility: hidden !important;
                }
                #token-slip-print-container {
                    display: block !important;
                    visibility: visible !important;
                    position: fixed !important;
                    top: 0 !important;
                    left: 0 !important;
                    width: 100% !important;
                    z-index: 99999 !important;
                    background: white !important;
                }
            }
            #token-slip-print-container {
                display: none;
            }
        `;
        document.head.appendChild(styleEl);

        // Inject the slip HTML as a hidden div in the current page's <body>
        const container = document.createElement('div');
        container.id = 'token-slip-print-container';
        container.innerHTML = this.generateSlipInnerHTML(slip);
        document.body.appendChild(container);

        // Trigger print on the current window (no new window opened)
        setTimeout(() => {
            window.print();
            // Clean up after print dialog is dismissed
            setTimeout(() => {
                container.remove();
                styleEl.remove();
            }, 1000);
        }, 300);
    }

    private generateSlipInnerHTML(slip: Patient): string {
        const today = new Date().toLocaleDateString('en-US', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });

        const hasFee = slip.totalFee !== null && slip.totalFee !== undefined;
        const consultationFeeStr = slip.consultationFee != null
            ? `Rs. ${slip.consultationFee.toLocaleString('en-PK')}` : '—';
        const sessionFeeStr = slip.sessionFee != null
            ? `Rs. ${slip.sessionFee.toLocaleString('en-PK')}` : '—';
        const totalFeeStr = slip.totalFee != null
            ? `Rs. ${slip.totalFee.toLocaleString('en-PK')}` : '—';

        return `
        <style>
            #token-slip-print-container * {
                margin: 0; padding: 0; box-sizing: border-box;
            }
            #token-slip-print-container {
                font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
                background: white;
                -webkit-print-color-adjust: exact;
                print-color-adjust: exact;
            }
            #token-slip-print-container .print-container {
                max-width: 580px;
                margin: 0 auto;
                padding: 30px 36px;
            }
            #token-slip-print-container .header-section {
                text-align: center;
                margin-bottom: 24px;
                border-bottom: 3px solid #047857;
                padding-bottom: 18px;
            }
            #token-slip-print-container .logo-section {
                display: flex;
                align-items: center;
                justify-content: center;
                gap: 14px;
                margin-bottom: 4px;
            }
            #token-slip-print-container .logo-section img {
                width: 54px; height: 54px; object-fit: contain;
            }
            #token-slip-print-container .company-info h1 {
                font-size: 22px; font-weight: 800; color: #0f172a;
                margin-bottom: 3px; text-align: left;
            }
            #token-slip-print-container .company-info p {
                font-size: 11px; color: #6b7280; font-weight: 500; text-align: left;
            }
            #token-slip-print-container .token-display {
                text-align: center; margin: 20px 0; padding: 22px 20px;
                background: #f8fafc; border-radius: 8px; border: 2px dashed #047857;
            }
            #token-slip-print-container .token-label {
                font-size: 11px; color: #6b7280; text-transform: uppercase;
                letter-spacing: 1px; margin-bottom: 8px; font-weight: 600;
            }
            #token-slip-print-container .token-number {
                font-size: 44px; font-weight: 900; color: #047857;
                font-family: 'Courier New', monospace; letter-spacing: 3px;
            }
            #token-slip-print-container .section {
                margin: 18px 0; padding: 16px 18px;
                background: #f8fafc; border-left: 4px solid #047857; border-radius: 4px;
            }
            #token-slip-print-container .section-title {
                font-size: 11px; font-weight: 800; color: #047857;
                text-transform: uppercase; letter-spacing: 0.5px;
                margin-bottom: 12px; padding-bottom: 8px; border-bottom: 1.5px solid #e5e7eb;
            }
            #token-slip-print-container .info-row {
                display: flex; justify-content: space-between;
                margin-bottom: 9px; font-size: 12.5px;
            }
            #token-slip-print-container .info-row:last-child { margin-bottom: 0; }
            #token-slip-print-container .info-label {
                font-weight: 700; color: #374151; min-width: 120px;
            }
            #token-slip-print-container .info-value {
                color: #4b5563; text-align: right; flex: 1;
            }
            #token-slip-print-container .fee-section {
                margin: 18px 0; padding: 16px 18px; background: #ecfdf5;
                border-left: 4px solid #047857; border-radius: 4px; border: 1.5px solid #a7f3d0;
            }
            #token-slip-print-container .fee-section .section-title { color: #065f46; }
            #token-slip-print-container .total-fee-row {
                display: flex; justify-content: space-between;
                margin-top: 10px; padding-top: 10px;
                border-top: 2px solid #6ee7b7; font-size: 14px;
            }
            #token-slip-print-container .total-fee-row .info-label {
                color: #065f46; font-size: 14px;
            }
            #token-slip-print-container .total-fee-row .info-value {
                color: #047857; font-weight: 800; font-size: 14px;
            }
            #token-slip-print-container .footer {
                text-align: center; margin-top: 22px; padding-top: 16px;
                border-top: 1.5px solid #e5e7eb; font-size: 10.5px; color: #9ca3af;
            }
            #token-slip-print-container .print-timestamp {
                font-size: 10px; color: #9ca3af; margin-top: 6px; font-style: italic;
            }
        </style>

        <div class="print-container">
            <div class="header-section">
                <div class="logo-section">
                    <img src="/assets/rufaydaLogo.jpg" alt="Logo" onerror="this.style.display='none'">
                    <div class="company-info">
                        <h1>Rufayda Health Complex</h1>
                        <p>Soan Gardens, Islamabad &nbsp;|&nbsp; +92 335 2015268</p>
                    </div>
                </div>
            </div>

            <div class="token-display">
                <div class="token-label">Your Token Number</div>
                <div class="token-number">${slip.token}</div>
            </div>

            <div class="section">
                <div class="section-title">Appointment Information</div>
                <div class="info-row">
                    <span class="info-label">Hospital:</span>
                    <span class="info-value">Rufayda Health Complex</span>
                </div>
                <div class="info-row">
                    <span class="info-label">Department:</span>
                    <span class="info-value">${slip.department || '—'}</span>
                </div>
                <div class="info-row">
                    <span class="info-label">Doctor:</span>
                    <span class="info-value">${slip.doctorName || 'Any'}</span>
                </div>
            </div>

            <div class="section">
                <div class="section-title">Patient Details</div>
                <div class="info-row">
                    <span class="info-label">Name:</span>
                    <span class="info-value">${slip.name || '—'}</span>
                </div>
                <div class="info-row">
                    <span class="info-label">MRN:</span>
                    <span class="info-value">${slip.mrn || '—'}</span>
                </div>
                <div class="info-row">
                    <span class="info-label">Phone:</span>
                    <span class="info-value">${slip.phone || '—'}</span>
                </div>
                <div class="info-row">
                    <span class="info-label">Age:</span>
                    <span class="info-value">${slip.age || '—'} years</span>
                </div>
                <div class="info-row">
                    <span class="info-label">Gender:</span>
                    <span class="info-value">${slip.gender || '—'}</span>
                </div>
            </div>

            ${slip.reason ? `
            <div class="section">
                <div class="section-title">Reason for Visit</div>
                <div style="font-size:12.5px; color:#374151; line-height:1.6;">
                    ${slip.reason}
                </div>
            </div>
            ` : ''}

            ${hasFee ? `
            <div class="fee-section">
                <div class="section-title">Fee Summary</div>
                <div class="info-row">
                    <span class="info-label">Consultation Fee:</span>
                    <span class="info-value">${consultationFeeStr}</span>
                </div>
                ${slip.sessionFee != null ? `
                <div class="info-row">
                    <span class="info-label">Session Fee:</span>
                    <span class="info-value">${sessionFeeStr}</span>
                </div>` : ''}
                <div class="total-fee-row">
                    <span class="info-label">Total Fee:</span>
                    <span class="info-value">${totalFeeStr}</span>
                </div>
            </div>
            ` : ''}

            <div class="footer">
                <p>Please keep this slip for your records.</p>
                <p class="print-timestamp">Generated on ${today}</p>
            </div>
        </div>`;
    }

    signOut() { this.router.navigate(['/']); }
}