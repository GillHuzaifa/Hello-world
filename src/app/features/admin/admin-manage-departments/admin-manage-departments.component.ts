import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { DoctorService } from '../../../core/services/doctor.service';
import { AuthService } from '../../../core/services/auth.service';
import { AdminSidebarComponent } from '../shared/components/admin-sidebar/admin-sidebar.component';

import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { InputTextModule } from 'primeng/inputtext';
import { ToastModule } from 'primeng/toast';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { RippleModule } from 'primeng/ripple';
import { MessageService, ConfirmationService } from 'primeng/api';

export interface Department {
    id?: string;
    name: string;
    description?: string;
    createdAt?: string;
}

@Component({
    selector: 'app-admin-manage-departments',
    standalone: true,
    imports: [
        CommonModule,
        FormsModule,
        AdminSidebarComponent,
        ButtonModule,
        DialogModule,
        InputTextModule,
        ToastModule,
        ConfirmDialogModule,
        RippleModule
    ],
    providers: [MessageService, ConfirmationService],
    templateUrl: './admin-manage-departments.component.html',
    styleUrl: './admin-manage-departments.component.css'
})
export class AdminManageDepartmentsComponent implements OnInit, OnDestroy {

    departments: Department[] = [];
    filteredDepartments: Department[] = [];
    searchText = '';

    showAddDialog = false;
    showEditDialog = false;

    addFormModel: Department = { name: '', description: '' };
    editFormModel: Department = { name: '', description: '' };
    editingDepartment: Department | null = null;

    isLoading = false;

    private hospitalId = '';
    private destroy$ = new Subject<void>();

    constructor(
        private doctorService: DoctorService,
        private authService: AuthService,
        private messageService: MessageService,
        private confirmationService: ConfirmationService
    ) { }

    ngOnInit(): void {
        this.hospitalId = this.resolveHospitalId();
        console.log('[DEBUG] Resolved hospital_id:', this.hospitalId);
        this.loadDepartments();
    }

    ngOnDestroy(): void {
        this.destroy$.next();
        this.destroy$.complete();
    }

    // ── LOAD ──────────────────────────────────────────────────

    loadDepartments(): void {
        this.isLoading = true;
        this.doctorService.listAdminDepartments(this.hospitalId || undefined)
            .pipe(takeUntil(this.destroy$))
            .subscribe({
                next: (res: any) => {
                    console.log('[DEBUG] Raw departments response:', JSON.stringify(res));

                    let depts: any[] = [];
                    if (Array.isArray(res)) depts = res;
                    else if (Array.isArray(res?.data)) depts = res.data;
                    else if (Array.isArray(res?.departments)) depts = res.departments;
                    else if (Array.isArray(res?.results)) depts = res.results;

                    const mapped = depts.map((dept: any) => {
                        if (typeof dept === 'object' && dept !== null) {
                            return {
                                id: dept.id || dept._id || dept.department_id || null,
                                name: dept.name || dept.department_name || '',
                                description: dept.description || '',
                                createdAt: dept.created_at || ''
                            };
                        }
                        // Backend returning plain strings — no UUID available
                        console.warn('[DEBUG] Department returned as plain string — no UUID:', dept);
                        return {
                            id: null,
                            name: String(dept),
                            description: '',
                            createdAt: ''
                        };
                    }).filter((d: Department) => d.name?.trim());

                    console.log('[DEBUG] Mapped departments:', mapped);
                    this.departments = mapped;
                    this.applyFilters();
                    this.isLoading = false;
                },
                error: (err: any) => {
                    console.error('Failed to load departments', err);
                    this.showError('Failed to load departments');
                    this.isLoading = false;
                }
            });
    }

    // ── SEARCH ────────────────────────────────────────────────

    onSearchInput(event: Event): void {
        this.searchText = (event.target as HTMLInputElement).value;
        this.applyFilters();
    }

    applyFilters(): void {
        if (!this.searchText?.trim()) {
            this.filteredDepartments = [...this.departments];
            return;
        }
        const term = this.searchText.toLowerCase();
        this.filteredDepartments = this.departments.filter(d =>
            d.name.toLowerCase().includes(term)
        );
    }

    // ── ADD ───────────────────────────────────────────────────

    openAddDialog(): void {
        this.addFormModel = { name: '', description: '' };
        this.showAddDialog = true;
    }

    closeAddDialog(): void {
        this.showAddDialog = false;
        this.addFormModel = { name: '', description: '' };
    }

    addDepartment(): void {
        if (!this.addFormModel.name?.trim()) {
            this.showWarn('Department name is required');
            return;
        }

        if (!this.hospitalId) {
            this.showError('Hospital ID not found. Please ensure your admin account has a hospital assigned.');
            return;
        }

        const payload = {
            name: this.addFormModel.name.trim(),
            description: this.addFormModel.description?.trim() || '',
            hospital_id: this.hospitalId
        };

        console.log('[DEBUG] Creating department with payload:', payload);

        this.doctorService.createDepartment(payload)
            .pipe(takeUntil(this.destroy$))
            .subscribe({
                next: (res: any) => {
                    console.log('[DEBUG] Create department response:', JSON.stringify(res));
                    // Always reload from backend to get real UUID assigned by DB
                    this.loadDepartments();
                    this.showSuccess(`"${payload.name}" added successfully`);
                    this.closeAddDialog();
                },
                error: (err: any) => {
                    console.error('Failed to create department', err);
                    this.showError('Failed to add department');
                }
            });
    }

    // ── EDIT ──────────────────────────────────────────────────

    openEditDialog(dept: Department): void {
        if (!dept.id) {
            this.showError('Cannot edit — department ID not available. Please refresh the page.');
            return;
        }
        this.editingDepartment = { ...dept };
        this.editFormModel = { ...dept };
        this.showEditDialog = true;
    }

    closeEditDialog(): void {
        this.showEditDialog = false;
        this.editFormModel = { name: '', description: '' };
        this.editingDepartment = null;
    }

    saveDepartment(): void {
        if (!this.editFormModel.name?.trim()) {
            this.showWarn('Department name is required');
            return;
        }
        if (!this.editingDepartment?.id) {
            this.showError('Department ID not found — cannot update');
            return;
        }

        const payload = {
            name: this.editFormModel.name.trim(),
            description: this.editFormModel.description?.trim() || ''
        };

        console.log('[DEBUG] Updating department id:', this.editingDepartment.id, 'payload:', payload);

        this.doctorService.updateDepartment(this.editingDepartment.id, payload)
            .pipe(takeUntil(this.destroy$))
            .subscribe({
                next: () => {
                    // Reload from backend to stay in sync
                    this.loadDepartments();
                    this.showSuccess('Department updated successfully');
                    this.closeEditDialog();
                },
                error: (err: any) => {
                    console.error('Failed to update department', err);
                    this.showError('Failed to update department');
                }
            });
    }

    // ── DELETE ────────────────────────────────────────────────

    confirmDeleteDepartment(dept: Department): void {
        if (!dept.id) {
            this.showError('Cannot delete — department ID not available. Backend must return objects with UUIDs.');
            return;
        }
        this.confirmationService.confirm({
            message: `Are you sure you want to delete "${dept.name}"?`,
            header: 'Confirm Delete',
            icon: 'pi pi-exclamation-triangle',
            accept: () => this.deleteDepartment(dept)
        });
    }

    deleteDepartment(dept: Department): void {
        if (!dept.id) {
            this.showError('Department ID not found');
            return;
        }

        console.log('[DEBUG] Deleting department id:', dept.id, 'name:', dept.name);

        this.doctorService.deleteDepartment(dept.id)
            .pipe(takeUntil(this.destroy$))
            .subscribe({
                next: () => {
                    this.departments = this.departments.filter(d => d.id !== dept.id);
                    this.applyFilters();
                    this.showSuccess(`"${dept.name}" deleted successfully`);
                },
                error: (err: any) => {
                    console.error('Failed to delete department', err);
                    this.showError('Failed to delete department');
                }
            });
    }

    // ── HELPERS ───────────────────────────────────────────────

    private resolveHospitalId(): string {
        const user = this.authService.getCurrentUser();
        const fromUser = (user as any)?.hospital_id || (user as any)?.hospitalId || '';
        if (fromUser) return fromUser;

        try {
            const token = localStorage.getItem('pulseq_token');
            if (!token) return '';
            const parts = token.split('.');
            if (parts.length !== 3) return '';
            const decoded = JSON.parse(atob(parts[1]));
            console.log('[DEBUG] JWT decoded:', decoded);
            return decoded.hospital_id || decoded.hospitalId || '';
        } catch (e) {
            console.error('[DEBUG] Error decoding JWT:', e);
            return '';
        }
    }

    private showSuccess(detail: string): void {
        this.messageService.add({ severity: 'success', summary: 'Success', detail, life: 3000 });
    }

    private showError(detail: string): void {
        this.messageService.add({ severity: 'error', summary: 'Error', detail, life: 3000 });
    }

    private showWarn(detail: string): void {
        this.messageService.add({ severity: 'warn', summary: 'Warning', detail, life: 3000 });
    }
}