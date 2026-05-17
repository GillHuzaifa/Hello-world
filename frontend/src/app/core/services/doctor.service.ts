import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { BehaviorSubject, Observable, of } from 'rxjs';
import { tap, catchError, map } from 'rxjs/operators';
import { environment } from '../../../environments/environment';
import { Doctor } from '../../shared/models/doctor.model';

export interface DoctorApiResponse {
  id: string;
  name: string;
  department: string;
  subcategory?: string;
  hospital_id: string;
  phone: string;
  email?: string;
  experience_years: number;
  rating?: number;
  review_count?: number;
  consultation_fee: number;
  session_fee?: number;
  has_session?: boolean;
  pricing_type?: string;
  status?: 'available' | 'busy' | 'offline' | 'on_leave';
  available_days?: string[];
  start_time: string;
  end_time: string;
  avatar_initials?: string;
  patients_per_day?: number;
  user_id?: string;
  created_at?: string;
  updated_at?: string;
}

export interface DoctorCreateRequest {
  name: string;
  department: string;
  subcategory?: string;
  hospital_id: string;
  phone: string;
  email: string;
  experience_years: number;
  consultation_fee: number;
  session_fee?: number;
  has_session?: boolean;
  pricing_type?: string;
  status?: string;
  available_days?: string[];
  start_time: string;
  end_time: string;
  avatar_initials?: string;
  patients_per_day?: number;
  password: string;
  rating?: number;
  review_count?: number;
}

export interface QueueStatus {
  doctor_id: string;
  total_in_queue: number;
  current_serving?: number;
  estimated_wait_minutes: number;
  status: string;
}

export interface DoctorWithQueue {
  doctor: DoctorApiResponse;
  queue: QueueStatus;
}

export interface DoctorSearchResponse {
  idoctors: DoctorWithQueue[];
  total_found: number;
  hospital_id: string;
  category?: string;
  subcategories?: string[];
}

@Injectable({
  providedIn: 'root'
})
export class DoctorService {

  private readonly API = `${environment.apiBaseUrl}/staff/doctors`;
  private readonly STAFF_DEPARTMENT_API = `${environment.apiBaseUrl}/staff/doctors/departments`;
  private readonly ADMIN_API = `${environment.apiBaseUrl}/staff/doctors`;
  private readonly CREATE_DOCTOR_API = `${environment.apiBaseUrl}/staff/doctors`;
  private readonly MANAGE_DOCTORS_API = `${environment.apiBaseUrl}/staff/doctors/manage`;

  private doctorsSubject = new BehaviorSubject<Doctor[]>([]);
  public doctors$ = this.doctorsSubject.asObservable();

  constructor(private http: HttpClient) { }

  // ============================================================
  // Doctor Methods
  // ============================================================

  listDoctors(options: {
    hospitalId?: string; specialization?: string;
    subcategory?: string; page?: number; limit?: number;
  } = {}): Observable<any> {
    let params = new HttpParams();
    if (options.hospitalId) params = params.set('hospital_id', options.hospitalId);
    if (options.specialization) params = params.set('specialization', options.specialization);
    if (options.subcategory) params = params.set('subcategory', options.subcategory);
    if (options.page) params = params.set('page', options.page.toString());
    if (options.limit) params = params.set('limit', options.limit.toString());
    return this.http.get(`${this.API}/`, { params });
  }

  getDoctor(doctorId: string): Observable<DoctorApiResponse> {
    return this.http.get<DoctorApiResponse>(`${this.API}/${doctorId}`);
  }

  getDoctorDetailsStaff(doctorId: string): Observable<any> {
    return this.http.get(`${this.ADMIN_API}/${doctorId}/details`);
  }

  getDoctorDetails(doctorId: string): Observable<any> {
    return this.http.get(`${this.ADMIN_API}/${doctorId}/details`);
  }

  createDoctor(data: DoctorCreateRequest): Observable<DoctorApiResponse> {
    return this.http.post<DoctorApiResponse>(`${this.CREATE_DOCTOR_API}/`, data);
  }

  updateDoctorApi(doctorId: string, data: any): Observable<any> {
    return this.http.patch(`${this.ADMIN_API}/${doctorId}`, data);
  }

  updateDoctorStatus(payload: any): Observable<any> {
    return this.http.patch(`${this.ADMIN_API}/status`, payload);
  }

  deleteDoctorApi(doctorId: string): Observable<any> {
    return this.http.delete(`${this.ADMIN_API}/${doctorId}`);
  }

  getDoctorsByHospital(
    hospitalId: string,
    category?: string,
    subcategory?: string,
    limit = 20
  ): Observable<DoctorSearchResponse> {
    let params = new HttpParams().set('limit', limit.toString());
    if (category) params = params.set('category', category);
    if (subcategory) params = params.set('subcategory', subcategory);
    return this.http.get<DoctorSearchResponse>(`${this.API}/hospital/${hospitalId}`, { params });
  }

  searchDoctors(query: string, options: {
    hospitalId?: string; category?: string;
    subcategory?: string; limit?: number;
  } = {}): Observable<DoctorSearchResponse> {
    let params = new HttpParams().set('query', query);
    if (options.hospitalId) params = params.set('hospital_id', options.hospitalId);
    if (options.category) params = params.set('category', options.category);
    if (options.subcategory) params = params.set('subcategory', options.subcategory);
    if (options.limit) params = params.set('limit', options.limit.toString());
    return this.http.get<DoctorSearchResponse>(`${this.API}/search`, { params });
  }

  getDoctorCategories(): Observable<any> {
    return this.http.get(`${this.API}/categories`);
  }

  getSubcategories(mainCategory: string, hospitalId?: string): Observable<any> {
    let params = new HttpParams().set('main_category', mainCategory);
    if (hospitalId) params = params.set('hospital_id', hospitalId);
    return this.http.get(`${this.API}/subcategories`, { params });
  }

  getDoctorsByMainCategory(
    mainCategory: string,
    hospitalId?: string,
    subcategory?: string,
    limit = 20
  ): Observable<any> {
    let params = new HttpParams();
    if (hospitalId) params = params.set('hospital_id', hospitalId);
    if (subcategory) params = params.set('subcategory', subcategory);
    if (limit) params = params.set('limit', limit.toString());
    return this.http.get(`${this.API}/by-category/${mainCategory}`, { params });
  }

  getDoctorAvailability(doctorId: string): Observable<any> {
    return this.http.get(`${this.API}/${doctorId}/availability`);
  }

  getDoctorAvailabilityToday(doctorId: string): Observable<any> {
    return this.http.get(`${this.API}/${doctorId}/availability/today`);
  }

  getAvailableSlots(doctorId: string, day: string, slotMinutes = 15): Observable<any> {
    const params = new HttpParams()
      .set('day', day)
      .set('slot_minutes', slotMinutes.toString());
    return this.http.get(`${this.API}/${doctorId}/available-slots`, { params });
  }

  getDoctorQueueStatus(doctorId: string): Observable<QueueStatus> {
    return this.http.get<QueueStatus>(`${this.ADMIN_API}/${doctorId}/queue`);
  }

  manageDoctors(options: {
    hospitalId?: string; department?: string;
    search?: string; page?: number; pageSize?: number;
  } = {}): Observable<any> {
    let params = new HttpParams();
    if (options.hospitalId) params = params.set('hospital_id', options.hospitalId);
    if (options.department) params = params.set('department', options.department);
    if (options.search) params = params.set('search', options.search);
    if (options.page) params = params.set('page', options.page.toString());
    if (options.pageSize) params = params.set('page_size', options.pageSize.toString());
    return this.http.get(`${this.ADMIN_API}/`, { params });
  }

  // ============================================================
  // Department Methods
  // ============================================================

  /**
   * ✅ FIX: Changed URL from /staff/doctors/departments
   *         to /staff/doctors/departments/list
   * The /list endpoint returns full objects { id, name, hospital_id, created_at }
   * The base endpoint was returning plain strings with no UUIDs
   */
  listDepartments(hospitalId?: string): Observable<any> {
    let params = new HttpParams();
    if (hospitalId) params = params.set('hospital_id', hospitalId);
    return this.http.get(`${this.STAFF_DEPARTMENT_API}/list`, { params }); // ← CHANGED
  }

  /**
   * ✅ FIX: Changed URL from /staff/doctors/departments
   *         to /staff/doctors/departments/list
   * This is the fix for both bugs:
   * 1. Add department not showing — now re-fetches with real UUIDs
   * 2. Delete using name instead of UUID — now dept.id is a real UUID
   */
  listAdminDepartments(hospitalId?: string): Observable<any> {
    let params = new HttpParams();
    if (hospitalId) params = params.set('hospital_id', hospitalId);
    return this.http.get(`${this.STAFF_DEPARTMENT_API}/list`, { params }).pipe( // ← CHANGED
      tap((res: any) => {
        console.log('[DoctorService] listAdminDepartments RAW:', JSON.stringify(res));
      })
    );
  }

  createDepartment(payload: {
    name: string;
    description: string;
    hospital_id: string;
  }): Observable<any> {
    console.log('[DoctorService] createDepartment POST:', this.STAFF_DEPARTMENT_API, payload);
    return this.http.post(`${this.STAFF_DEPARTMENT_API}`, payload);
  }

  updateDepartment(id: string, payload: {
    name: string;
    description: string;
  }): Observable<any> {
    console.log('[DoctorService] updateDepartment PATCH id:', id, payload);
    return this.http.patch(`${this.STAFF_DEPARTMENT_API}/${id}`, payload);
  }

  deleteDepartment(id: string): Observable<any> {
    console.log('[DoctorService] deleteDepartment DELETE id:', id);
    return this.http.delete(`${this.STAFF_DEPARTMENT_API}/${id}`);
  }

  // ============================================================
  // Legacy compatibility methods
  // ============================================================

  private toLegacyDoctor(apiDoc: DoctorApiResponse): Doctor {
    return {
      id: apiDoc.id,
      name: apiDoc.name,
      specialization: apiDoc.department,
      qualifications: '',
      timings: `${apiDoc.start_time} – ${apiDoc.end_time}`,
      available: apiDoc.status === 'available',
      fee: `Rs. ${apiDoc.consultation_fee}`,
      department: apiDoc.department,
      onLeave: apiDoc.status === 'on_leave'
    };
  }

  getDoctors(): Doctor[] {
    return this.doctorsSubject.value;
  }

  getDoctorsObservable(): Observable<Doctor[]> {
    return this.doctors$;
  }

  updateDoctor(updatedDoctor: Doctor): void {
    const current = this.doctorsSubject.value;
    const index = current.findIndex(d => d.id === updatedDoctor.id);
    if (index !== -1) {
      current[index] = updatedDoctor;
      this.doctorsSubject.next([...current]);
    }
  }

  addDoctor(doctor: Omit<Doctor, 'id'>): void {
    const maxId = Math.max(...this.doctorsSubject.value.map(d => parseInt(d.id)), 0);
    const newId = (maxId + 1).toString();
    const newDoctor: Doctor = { ...doctor, id: newId };
    this.doctorsSubject.next([...this.doctorsSubject.value, newDoctor]);
  }

  deleteDoctor(id: string): void {
    const filtered = this.doctorsSubject.value.filter(d => d.id !== id);
    this.doctorsSubject.next(filtered);
  }

  loadDoctorsFromApi(hospitalId?: string): void {
    this.listDoctors({ hospitalId, limit: 100 }).pipe(
      map((response: any) => {
        const docs = response?.doctors || response || [];
        return Array.isArray(docs) ? docs.map((d: any) => this.toLegacyDoctor(d)) : [];
      }),
      catchError(() => of([]))
    ).subscribe(doctors => {
      this.doctorsSubject.next(doctors);
    });
  }
}