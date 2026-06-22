import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../services/api.js';
import { subscribeRealtime, onReconnect } from '../realtime/socket.js';
import StaffAvailabilityPanel from '../components/StaffAvailabilityPanel.jsx';
import { AlertCircle, CheckCircle2, Loader2 } from 'lucide-react';
import { PageHeader } from '../components/ui/PageHeader.jsx';

const TABS = [
  { id: 'appointments', label: 'Appointments' },
  { id: 'schedule', label: 'Schedule' },
  { id: 'staff', label: 'Staff' },
  { id: 'services', label: 'Services' },
  { id: 'products', label: 'Products' },
  { id: 'locations', label: 'Locations' },
  { id: 'calendar', label: 'Calendar' },
  { id: 'notifications', label: 'Notifications' },
  { id: 'waitlist', label: 'Waitlist' },
  { id: 'analytics', label: 'Analytics' },
];

const RULE_PRESETS = [
  { id: 'weekdays', label: 'Weekdays (Mon–Fri)' },
  { id: 'every_monday', label: 'Every Monday' },
  { id: 'alternate_saturday', label: 'Alternate Saturday' },
  { id: 'first_sunday', label: 'First Sunday of month' },
];

const STATUSES = ['PENDING', 'CONFIRMED', 'CHECKED_IN', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'NO_SHOW'];
const APPT_PAGE_SIZE = 50;

function startOfWeekMonday(date = new Date()) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function localDayKey(d) {
  const dt = new Date(d);
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, '0');
  const day = String(dt.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function formatSourceLabel(source) {
  const labels = {
    DASHBOARD: 'Dashboard',
    PUBLIC_BOOKING: 'Public web',
    WHATSAPP: 'WhatsApp AI',
    WHATSAPP_AI: 'WhatsApp AI',
    WAITLIST: 'Waitlist',
  };
  return labels[source] || String(source || 'Unknown').replace(/_/g, ' ');
}

function isVideoUrl(url) {
  return /\.(mp4|mov|webm|ogg|qt)(\?.*)?$/i.test(url || '');
}

function todayDateInput() {
  return new Date().toISOString().slice(0, 10);
}

export default function Scheduling() {
  const [searchParams, setSearchParams] = useSearchParams();
  const initialTab = searchParams.get('tab') || 'appointments';
  const [tab, setTab] = useState(initialTab);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [loading, setLoading] = useState(true);

  const [appointments, setAppointments] = useState([]);
  const [staff, setStaff] = useState([]);
  const [services, setServices] = useState([]);
  const [locations, setLocations] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [waitlist, setWaitlist] = useState([]);
  const [analytics, setAnalytics] = useState(null);
  const [calendarInfo, setCalendarInfo] = useState({
    configured: false,
    googleConfigured: false,
    outlookConfigured: false,
    appleConfigured: false,
    connections: [],
  });
  const [schedSettings, setSchedSettings] = useState(null);
  const [appleForm, setAppleForm] = useState({ appleId: '', appPassword: '' });
  const [scheduleStaffId, setScheduleStaffId] = useState('');
  const [todaySchedule, setTodaySchedule] = useState([]);
  const [upcomingSchedule, setUpcomingSchedule] = useState([]);
  const [weekStart, setWeekStart] = useState(() => startOfWeekMonday());
  const [weekAppointments, setWeekAppointments] = useState([]);
  const [allStaffToday, setAllStaffToday] = useState([]);
  const [availRules, setAvailRules] = useState([]);
  const [selectedStaffId, setSelectedStaffId] = useState('');
  const [ruleForm, setRuleForm] = useState({
    preset: 'weekdays',
    startTime: '09:00',
    endTime: '18:00',
    ruleType: 'AVAILABLE',
  });

  const [bookForm, setBookForm] = useState({
    customerId: '',
    serviceId: '',
    staffId: '',
    locationId: '',
    date: new Date().toISOString().slice(0, 10),
    slotStart: '',
    collectAdvance: false,
    notes: '',
  });
  const [slots, setSlots] = useState([]);

  const [staffForm, setStaffForm] = useState({
    staffCode: '',
    name: '',
    mobile: '',
    designation: '',
    department: '',
    bio: '',
    skills: '',
    profilePicture: '',
  });
  const [staffPhotoUploading, setStaffPhotoUploading] = useState(false);
  const [serviceImageUploading, setServiceImageUploading] = useState(false);
  const [locationImageUploading, setLocationImageUploading] = useState(false);
  const [products, setProducts] = useState([]);
  const [productForm, setProductForm] = useState({ name: '', price: '', description: '', imageUrl: '' });
  const [productImageUploading, setProductImageUploading] = useState(false);
  const [editingProductIdx, setEditingProductIdx] = useState(-1);
  const [editingStaffId, setEditingStaffId] = useState('');
  const [serviceForm, setServiceForm] = useState({
    code: '',
    name: '',
    durationMin: 30,
    price: 0,
    bufferBefore: 0,
    bufferAfter: 0,
    rebookingIntervalDays: '',
    categoryId: '',
    imageUrl: '',
  });
  const [categories, setCategories] = useState([]);
  const [categoryForm, setCategoryForm] = useState({ name: '', sortOrder: 0 });
  const [editingCategoryId, setEditingCategoryId] = useState('');
  const [linkableUsers, setLinkableUsers] = useState([]);
  const [publicBooking, setPublicBooking] = useState({ enabled: false, url: '', collectAdvance: false });
  const [recentRatings, setRecentRatings] = useState([]);
  const [analyticsDays, setAnalyticsDays] = useState(30);
  const [editingServiceId, setEditingServiceId] = useState('');
  const [customerStats, setCustomerStats] = useState(null);
  const [locationForm, setLocationForm] = useState({
    code: 'MAIN',
    name: 'Main Branch',
    timezone: 'Asia/Kolkata',
    addressLine1: '',
    city: '',
    phone: '',
    mediaUrls: [],
    geoFenceEnabled: false,
    allowedRadiusMeters: 100,
    outsideRadiusAction: 'WARN',
  });
  const [editingLocationId, setEditingLocationId] = useState('');
  const [selectedApptId, setSelectedApptId] = useState('');
  const [apptDetail, setApptDetail] = useState(null);
  const [apptManageLink, setApptManageLink] = useState('');
  const [apptDetailLoading, setApptDetailLoading] = useState(false);
  const [waitlistForm, setWaitlistForm] = useState({
    customerId: '',
    serviceId: '',
    locationId: '',
    staffId: '',
    preferredDate: '',
  });
  const [quickCustomerForm, setQuickCustomerForm] = useState({ phone: '', name: '', email: '' });
  const [quickCustomerBusy, setQuickCustomerBusy] = useState(false);
  const [apptFilter, setApptFilter] = useState({ status: '', staffId: '', customerId: '', from: '', to: '', q: '' });
  const [holidays, setHolidays] = useState([]);
  const [holidayForm, setHolidayForm] = useState({ name: '', startDate: '', endDate: '', locationId: '' });
  const [notifTestApptId, setNotifTestApptId] = useState('');
  const [notifTestBusy, setNotifTestBusy] = useState(false);
  const [notifTestResult, setNotifTestResult] = useState(null);
  const [weekRescheduleAppt, setWeekRescheduleAppt] = useState(null);
  const [apptPagination, setApptPagination] = useState({
    page: 1,
    pageSize: APPT_PAGE_SIZE,
    total: 0,
    totalPages: 1,
    hasMore: false,
  });
  const [pendingCount, setPendingCount] = useState(0);
  const [notifTestAppointments, setNotifTestAppointments] = useState([]);

  useEffect(() => {
    if (!bookForm.customerId) {
      setCustomerStats(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const { data } = await api.get(`/scheduling/customers/${bookForm.customerId}/stats`);
        if (!cancelled) setCustomerStats(data);
      } catch {
        if (!cancelled) setCustomerStats(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [bookForm.customerId]);

  useEffect(() => {
    const connected = searchParams.get('connected');
    const oauthError = searchParams.get('error');
    if (connected === 'outlook') setInfo('Outlook Calendar connected');
    else if (connected) setInfo('Google Calendar connected');
    if (oauthError) setError(`Calendar OAuth failed: ${oauthError}`);
    const urlTab = searchParams.get('tab');
    if (urlTab) setTab(urlTab);
    const customerId = searchParams.get('customerId');
    if (customerId) {
      setApptFilter((f) => ({ ...f, customerId }));
    }
  }, [searchParams]);

  const deepLinkApptRef = useRef(null);
  const deepLinkCustomerRef = useRef(null);

  useEffect(() => {
    const apptId = searchParams.get('appt');
    if (!apptId || loading || deepLinkApptRef.current === apptId) return;
    deepLinkApptRef.current = apptId;
    setTab('appointments');
    void openAppointmentDetail(apptId);
  }, [searchParams, loading]);

  const loadCalendar = useCallback(async () => {
    try {
      const { data } = await api.get('/scheduling/calendar/connections');
      setCalendarInfo({
        configured: Boolean(data?.configured),
        googleConfigured: Boolean(data?.googleConfigured ?? data?.configured),
        outlookConfigured: Boolean(data?.outlookConfigured),
        appleConfigured: Boolean(data?.appleConfigured ?? true),
        connections: Array.isArray(data?.connections) ? data.connections : [],
      });
    } catch {
      setCalendarInfo({
        configured: false,
        googleConfigured: false,
        outlookConfigured: false,
        appleConfigured: true,
        connections: [],
      });
    }
  }, []);

  const loadSchedSettings = useCallback(async () => {
    try {
      const { data } = await api.get('/scheduling/settings');
      setSchedSettings(data);
    } catch {
      setSchedSettings(null);
    }
  }, []);

  const loadAvailRules = useCallback(async (staffId) => {
    if (!staffId) {
      setAvailRules([]);
      return;
    }
    try {
      const { data } = await api.get(`/scheduling/staff/${staffId}/availability-rules`);
      setAvailRules(Array.isArray(data) ? data : []);
    } catch {
      setAvailRules([]);
    }
  }, []);

  const loadStaffSchedule = useCallback(async (staffId, weekAnchor = weekStart) => {
    if (!staffId) {
      setTodaySchedule([]);
      setUpcomingSchedule([]);
      setWeekAppointments([]);
      return;
    }
    try {
      const weekEnd = new Date(weekAnchor);
      weekEnd.setDate(weekEnd.getDate() + 7);
      const [todayRes, upcomingRes, weekRes] = await Promise.all([
        api.get(`/scheduling/staff/${staffId}/schedule/today`),
        api.get(`/scheduling/staff/${staffId}/schedule/upcoming`, { params: { days: 7 } }),
        api.get('/scheduling/appointments', {
          params: {
            staffId,
            from: weekAnchor.toISOString(),
            to: weekEnd.toISOString(),
            pageSize: 200,
          },
        }),
      ]);
      setTodaySchedule(Array.isArray(todayRes.data) ? todayRes.data : []);
      setUpcomingSchedule(Array.isArray(upcomingRes.data) ? upcomingRes.data : []);
      setWeekAppointments(Array.isArray(weekRes.data?.items) ? weekRes.data.items : []);
    } catch {
      setTodaySchedule([]);
      setUpcomingSchedule([]);
      setWeekAppointments([]);
    }
  }, [weekStart]);

  const loadPendingCount = useCallback(async () => {
    try {
      const { data } = await api.get('/scheduling/appointments', {
        params: { status: 'PENDING', pageSize: 1 },
      });
      setPendingCount(data?.total ?? 0);
    } catch {
      setPendingCount(0);
    }
  }, []);

  const loadAppointments = useCallback(async (filters = {}, page = 1) => {
    const params = { page, pageSize: APPT_PAGE_SIZE };
    if (filters.status) params.status = filters.status;
    if (filters.staffId) params.staffId = filters.staffId;
    if (filters.customerId) params.customerId = filters.customerId;
    if (filters.from) params.from = filters.from;
    if (filters.to) params.to = `${filters.to}T23:59:59.999Z`;
    if (filters.q) params.q = filters.q;
    const { data } = await api.get('/scheduling/appointments', { params });
    setAppointments(Array.isArray(data?.items) ? data.items : []);
    setApptPagination({
      page: data?.page ?? page,
      pageSize: data?.pageSize ?? APPT_PAGE_SIZE,
      total: data?.total ?? 0,
      totalPages: data?.totalPages ?? 1,
      hasMore: Boolean(data?.hasMore),
    });
  }, []);

  useEffect(() => {
    const customerId = searchParams.get('customerId');
    if (!customerId || loading || deepLinkCustomerRef.current === customerId) return;
    deepLinkCustomerRef.current = customerId;
    setTab('appointments');
    const next = { status: '', staffId: '', customerId, from: '', to: '', q: '' };
    setApptFilter(next);
    void loadAppointments(next);
  }, [searchParams, loading, loadAppointments]);

  const loadAll = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      await api.post('/scheduling/seed-defaults').catch(() => {});
      const [apptRes, pendingRes, staffRes, svcRes, locRes, custRes, wlRes, anRes, catRes, pbRes] = await Promise.all([
        api.get('/scheduling/appointments', { params: { page: 1, pageSize: APPT_PAGE_SIZE } }),
        api.get('/scheduling/appointments', { params: { status: 'PENDING', pageSize: 1 } }),
        api.get('/scheduling/staff'),
        api.get('/scheduling/services'),
        api.get('/scheduling/locations'),
        api.get('/dashboard/customers?limit=500'),
        api.get('/scheduling/waitlist').catch(() => ({ data: [] })),
        api.get('/scheduling/analytics/summary').catch(() => ({ data: null })),
        api.get('/scheduling/service-categories').catch(() => ({ data: [] })),
        api.get('/scheduling/public-booking/link').catch(() => ({ data: { enabled: false, url: '' } })),
      ]);
      setAppointments(Array.isArray(apptRes.data?.items) ? apptRes.data.items : []);
      setApptPagination({
        page: apptRes.data?.page ?? 1,
        pageSize: apptRes.data?.pageSize ?? APPT_PAGE_SIZE,
        total: apptRes.data?.total ?? 0,
        totalPages: apptRes.data?.totalPages ?? 1,
        hasMore: Boolean(apptRes.data?.hasMore),
      });
      setPendingCount(pendingRes.data?.total ?? 0);
      setStaff(Array.isArray(staffRes.data) ? staffRes.data : []);
      setServices(Array.isArray(svcRes.data) ? svcRes.data : []);
      setLocations(Array.isArray(locRes.data) ? locRes.data : []);
      setCustomers(Array.isArray(custRes.data) ? custRes.data : []);
      setWaitlist(Array.isArray(wlRes.data) ? wlRes.data : []);
      setAnalytics(anRes.data);
      setCategories(Array.isArray(catRes.data) ? catRes.data : []);
      setPublicBooking({
        enabled: Boolean(pbRes.data?.enabled),
        url: pbRes.data?.url || '',
        collectAdvance: Boolean(pbRes.data?.collectAdvance),
      });
      await loadCalendar();
    } catch (e) {
      setError(e.response?.data?.error || 'Failed to load scheduling data');
    } finally {
      setLoading(false);
    }
  }, [loadCalendar]);

  useEffect(() => {
    if (tab !== 'notifications') return;
    void loadSchedSettings();
    api.get('/scheduling/appointments', {
      params: { page: 1, pageSize: 30, status: 'CONFIRMED' },
    })
      .then(({ data }) => {
        const upcoming = (data?.items || []).filter(
          (a) => new Date(a.startAt) >= new Date(),
        );
        setNotifTestAppointments(upcoming);
      })
      .catch(() => setNotifTestAppointments([]));
  }, [tab, loadSchedSettings]);

  useEffect(() => {
    if (tab !== 'schedule') return;
    api.get('/scheduling/holidays')
      .then(({ data }) => setHolidays(Array.isArray(data) ? data : []))
      .catch(() => setHolidays([]));
  }, [tab]);

  useEffect(() => {
    if (tab !== 'staff') return;
    api.get('/scheduling/staff/linkable-users')
      .then(({ data }) => setLinkableUsers(Array.isArray(data) ? data : []))
      .catch(() => setLinkableUsers([]));
  }, [tab]);

  useEffect(() => {
    if (tab !== 'analytics') return;
    api.get('/scheduling/analytics/summary', { params: { days: analyticsDays } })
      .then(({ data }) => setAnalytics(data))
      .catch(() => setAnalytics(null));
    api.get('/scheduling/ratings', { params: { days: analyticsDays } })
      .then(({ data }) => setRecentRatings(Array.isArray(data) ? data : []))
      .catch(() => setRecentRatings([]));
  }, [tab, analyticsDays]);

  useEffect(() => {
    if (tab !== 'products') return;
    api.get('/config')
      .then(({ data }) => setProducts(Array.isArray(data.config?.products) ? data.config.products : []))
      .catch(() => setProducts([]));
  }, [tab]);

  useEffect(() => {
    if (selectedStaffId) void loadAvailRules(selectedStaffId);
  }, [selectedStaffId, loadAvailRules]);

  useEffect(() => {
    if (tab !== 'schedule') return;
    api.get('/scheduling/schedule/today')
      .then(({ data }) => setAllStaffToday(Array.isArray(data) ? data : []))
      .catch(() => setAllStaffToday([]));
  }, [tab, appointments, todaySchedule]);

  useEffect(() => {
    if (scheduleStaffId) void loadStaffSchedule(scheduleStaffId, weekStart);
  }, [scheduleStaffId, weekStart, loadStaffSchedule]);

  useEffect(() => {
    if (staff.length && !scheduleStaffId) setScheduleStaffId(staff[0].id);
  }, [staff, scheduleStaffId]);

  useEffect(() => {
    void loadAll();
    const unsub = subscribeRealtime((evt) => {
      if (evt?.type?.startsWith('appointment_') || evt?.type === 'scheduling_changed') {
        void loadAll();
        if (scheduleStaffId) void loadStaffSchedule(scheduleStaffId, weekStart);
      }
    });
    const unsubRc = onReconnect(() => void loadAll());
    return () => {
      unsub();
      unsubRc();
    };
  }, [loadAll, loadStaffSchedule, scheduleStaffId, weekStart]);

  async function loadSlots() {
    if (!bookForm.serviceId || !bookForm.date) return;
    try {
      const { data } = await api.get('/scheduling/slots/available', {
        params: {
          serviceId: bookForm.serviceId,
          locationId: bookForm.locationId || undefined,
          staffId: bookForm.staffId || undefined,
          date: bookForm.date,
        },
      });
      setSlots(Array.isArray(data.slots) ? data.slots : []);
    } catch (e) {
      setError(e.response?.data?.error || 'Could not load slots');
    }
  }

  async function createAppointmentFromSlot(slot) {
    setError('');
    try {
      const idempotencyKey = crypto.randomUUID();
      const { data } = await api.post(
        '/scheduling/appointments',
        {
          customerId: bookForm.customerId,
          serviceId: bookForm.serviceId,
          staffId: slot.staffId,
          locationId: slot.locationId,
          startAt: slot.startAt,
          status: 'CONFIRMED',
          collectAdvance: bookForm.collectAdvance,
          notes: bookForm.notes || undefined,
        },
        { headers: { 'Idempotency-Key': idempotencyKey } },
      );
      if (data?.paymentIntent?.paymentLinkUrl) {
        setInfo(`Appointment booked — payment link sent (${data.paymentIntent.paymentLinkUrl})`);
      } else if (data?.replayed) {
        setInfo('Appointment already booked (duplicate request ignored)');
      } else {
        const warn = Array.isArray(data?.warnings) && data.warnings.length
          ? ` — Note: ${data.warnings.join('; ')}`
          : '';
        setInfo(`Appointment booked${warn}`);
      }
      setBookForm((f) => ({ ...f, slotStart: '' }));
      setSlots([]);
      await loadAll();
    } catch (e) {
      setError(e.response?.data?.error || 'Booking failed');
    }
  }

  async function patchStatus(id, status, reason) {
    try {
      await api.patch(`/scheduling/appointments/${id}/status`, { status, reason: reason || undefined });
      await loadAppointments(apptFilter, apptPagination.page);
      await loadPendingCount();
      if (tab === 'schedule') {
        const { data } = await api.get('/scheduling/schedule/today');
        setAllStaffToday(Array.isArray(data) ? data : []);
      }
    } catch (e) {
      setError(e.response?.data?.error || 'Status update failed');
    }
  }

  async function addQuickCustomer(e) {
    e?.preventDefault?.();
    if (!quickCustomerForm.phone) {
      setError('Phone required to add customer');
      return;
    }
    setQuickCustomerBusy(true);
    try {
      const { data } = await api.post('/scheduling/customers/quick', quickCustomerForm);
      setCustomers((prev) => {
        const exists = prev.some((c) => c.id === data.id);
        if (exists) return prev.map((c) => (c.id === data.id ? { ...c, ...data } : c));
        return [data, ...prev];
      });
      setBookForm((f) => ({ ...f, customerId: data.id }));
      setQuickCustomerForm({ phone: '', name: '', email: '' });
      setInfo('Customer added');
    } catch (err) {
      setError(err.response?.data?.error || 'Could not add customer');
    } finally {
      setQuickCustomerBusy(false);
    }
  }

  async function saveStaff(e) {
    e.preventDefault();
    try {
      const skills = staffForm.skills
        ? staffForm.skills.split(',').map((s) => s.trim()).filter(Boolean)
        : [];
      const payload = {
        name: staffForm.name,
        mobile: staffForm.mobile,
        designation: staffForm.designation,
        department: staffForm.department || undefined,
        bio: staffForm.bio || undefined,
        skills,
        profilePicture: staffForm.profilePicture || undefined,
      };
      if (editingStaffId) {
        await api.patch(`/scheduling/staff/${editingStaffId}`, payload);
        setInfo('Staff updated');
      } else {
        await api.post('/scheduling/staff', {
          ...payload,
          staffCode: staffForm.staffCode,
          locationIds: locations[0] ? [locations[0].id] : [],
          serviceIds: services.map((s) => s.id),
        });
        setInfo('Staff created');
      }
      setStaffForm({
        staffCode: '',
        name: '',
        mobile: '',
        designation: '',
        department: '',
        bio: '',
        skills: '',
        profilePicture: '',
      });
      setEditingStaffId('');
      await loadAll();
    } catch (err) {
      setError(err.response?.data?.error || 'Could not save staff');
    }
  }

  async function uploadStaffPhoto(file) {
    if (!file) return;
    if (!editingStaffId) {
      setError('Save staff first, then upload a photo');
      return;
    }
    setStaffPhotoUploading(true);
    try {
      let presign;
      try {
        const { data } = await api.post(`/scheduling/staff/${editingStaffId}/profile-picture/presign`, {
          mimeType: file.type || 'image/jpeg',
          fileName: file.name,
        });
        presign = data;
      } catch (err) {
        if (err.response?.status !== 501) throw err;
      }

      if (presign?.uploadUrl) {
        await fetch(presign.uploadUrl, {
          method: 'PUT',
          headers: { 'Content-Type': file.type || 'image/jpeg' },
          body: file,
        });
        await api.post(`/scheduling/staff/${editingStaffId}/profile-picture/confirm`, {
          publicUrl: presign.publicUrl,
        });
        setStaffForm((f) => ({ ...f, profilePicture: presign.publicUrl }));
      } else {
        const base64Data = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result || ''));
          reader.onerror = () => reject(new Error('File read failed'));
          reader.readAsDataURL(file);
        });
        const { data } = await api.post(`/scheduling/staff/${editingStaffId}/profile-picture/upload`, {
          base64Data,
          mimeType: file.type || 'image/jpeg',
          fileName: file.name,
        });
        setStaffForm((f) => ({ ...f, profilePicture: data.profilePicture || data.publicUrl || '' }));
      }
      setInfo('Profile photo updated');
      await loadAll();
    } catch (err) {
      setError(err.response?.data?.error || 'Could not upload photo');
    } finally {
      setStaffPhotoUploading(false);
    }
  }

  function startEditStaff(s) {
    const skills = Array.isArray(s.skills) ? s.skills.join(', ') : '';
    setEditingStaffId(s.id);
    setStaffForm({
      staffCode: s.staffCode || '',
      name: s.name || '',
      mobile: s.mobile || '',
      designation: s.designation || '',
      department: s.department || '',
      bio: s.bio || '',
      skills,
      profilePicture: s.profilePicture || '',
    });
  }

  function cancelEditStaff() {
    setEditingStaffId('');
    setStaffForm({
      staffCode: '',
      name: '',
      mobile: '',
      designation: '',
      department: '',
      bio: '',
      skills: '',
      profilePicture: '',
    });
  }

  async function toggleLocationActive(loc) {
    try {
      await api.patch(`/scheduling/locations/${loc.id}`, { isActive: !loc.isActive });
      setInfo(loc.isActive ? 'Location deactivated' : 'Location activated');
      await loadAll();
    } catch (err) {
      setError(err.response?.data?.error || 'Could not update location');
    }
  }

  async function createService(e) {
    e.preventDefault();
    try {
      const payload = {
        ...serviceForm,
        categoryId: serviceForm.categoryId || null,
        rebookingIntervalDays:
          serviceForm.rebookingIntervalDays === '' || serviceForm.rebookingIntervalDays == null
            ? null
            : Number(serviceForm.rebookingIntervalDays),
      };
      if (editingServiceId) {
        await api.patch(`/scheduling/services/${editingServiceId}`, payload);
        setInfo('Service updated');
        setEditingServiceId('');
      } else {
        await api.post('/scheduling/services', payload);
        setInfo('Service created');
      }
      setServiceForm({
        code: '',
        name: '',
        durationMin: 30,
        price: 0,
        bufferBefore: 0,
        bufferAfter: 0,
        rebookingIntervalDays: '',
        categoryId: '',
        imageUrl: '',
      });
      await loadAll();
    } catch (err) {
      setError(err.response?.data?.error || 'Could not save service');
    }
  }

  function startEditService(service) {
    setEditingServiceId(service.id);
    setServiceForm({
      code: service.code,
      name: service.name,
      durationMin: service.durationMin,
      price: service.price,
      bufferBefore: service.bufferBefore ?? 0,
      bufferAfter: service.bufferAfter ?? 0,
      rebookingIntervalDays: service.rebookingIntervalDays ?? '',
      categoryId: service.categoryId || service.category?.id || '',
      imageUrl: service.imageUrl || '',
    });
  }

  function cancelEditService() {
    setEditingServiceId('');
    setServiceForm({
      code: '',
      name: '',
      durationMin: 30,
      price: 0,
      bufferBefore: 0,
      bufferAfter: 0,
      rebookingIntervalDays: '',
      categoryId: '',
      imageUrl: '',
    });
  }

  async function uploadServiceImage(file) {
    if (!file) return;
    setServiceImageUploading(true);
    try {
      const base64Data = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ''));
        reader.onerror = () => reject(new Error('File read failed'));
        reader.readAsDataURL(file);
      });
      const { data } = await api.post('/media/upload', {
        base64Data,
        mimeType: file.type || 'image/jpeg',
        fileName: file.name,
      });
      setServiceForm((f) => ({ ...f, imageUrl: data.publicUrl || '' }));
      setInfo('Image uploaded');
    } catch (err) {
      setError(err.response?.data?.error || 'Image upload failed');
    } finally {
      setServiceImageUploading(false);
    }
  }

  async function uploadProductImage(file, onDone) {
    if (!file) return;
    setProductImageUploading(true);
    try {
      const base64Data = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ''));
        reader.onerror = () => reject(new Error('File read failed'));
        reader.readAsDataURL(file);
      });
      const { data } = await api.post('/media/upload', {
        base64Data,
        mimeType: file.type || 'image/jpeg',
        fileName: file.name,
      });
      onDone(data.publicUrl || '');
      setInfo('Image uploaded');
    } catch (err) {
      setError(err.response?.data?.error || 'Image upload failed');
    } finally {
      setProductImageUploading(false);
    }
  }

  async function uploadLocationMedia(file) {
    if (!file) return;
    setLocationImageUploading(true);
    try {
      const base64Data = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ''));
        reader.onerror = () => reject(new Error('File read failed'));
        reader.readAsDataURL(file);
      });
      const { data } = await api.post('/media/upload', {
        base64Data,
        mimeType: file.type || 'image/jpeg',
        fileName: file.name,
      });
      const url = data.publicUrl || '';
      if (url) setLocationForm((f) => ({ ...f, mediaUrls: [...(f.mediaUrls || []), url] }));
      setInfo('Media uploaded');
    } catch (err) {
      setError(err.response?.data?.error || 'Upload failed');
    } finally {
      setLocationImageUploading(false);
    }
  }

  function removeLocationMedia(idx) {
    setLocationForm((f) => ({ ...f, mediaUrls: (f.mediaUrls || []).filter((_, i) => i !== idx) }));
  }

  async function saveProducts(updatedProducts) {
    try {
      await api.put('/config', { products: updatedProducts });
      setProducts(updatedProducts);
      setInfo('Products saved');
    } catch (err) {
      setError(err.response?.data?.error || 'Could not save products');
    }
  }

  async function saveCategory(e) {
    e.preventDefault();
    if (!categoryForm.name.trim()) return setError('Category name required');
    try {
      if (editingCategoryId) {
        await api.patch(`/scheduling/service-categories/${editingCategoryId}`, categoryForm);
        setInfo('Category updated');
        setEditingCategoryId('');
      } else {
        await api.post('/scheduling/service-categories', categoryForm);
        setInfo('Category created');
      }
      setCategoryForm({ name: '', sortOrder: 0 });
      const { data } = await api.get('/scheduling/service-categories');
      setCategories(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err.response?.data?.error || 'Could not save category');
    }
  }

  async function deleteCategory(id) {
    try {
      await api.delete(`/scheduling/service-categories/${id}`);
      setInfo('Category removed');
      const { data } = await api.get('/scheduling/service-categories');
      setCategories(Array.isArray(data) ? data : []);
      await loadAll();
    } catch (err) {
      setError(err.response?.data?.error || 'Could not delete category');
    }
  }

  async function togglePublicBooking(enabled) {
    try {
      await api.patch('/scheduling/settings', { publicBookingEnabled: enabled });
      const { data } = await api.get('/scheduling/public-booking/link');
      setPublicBooking({
        enabled: Boolean(data?.enabled),
        url: data?.url || '',
        collectAdvance: Boolean(data?.collectAdvance),
      });
      setInfo(enabled ? 'Public booking enabled' : 'Public booking disabled');
    } catch (err) {
      setError(err.response?.data?.error || 'Could not update public booking');
    }
  }

  async function togglePublicBookingAdvance(collectAdvance) {
    try {
      await api.patch('/scheduling/settings', { publicBookingCollectAdvance: collectAdvance });
      setPublicBooking((p) => ({ ...p, collectAdvance }));
      setInfo(collectAdvance ? 'Advance payment enabled on public booking' : 'Advance payment disabled');
    } catch (err) {
      setError(err.response?.data?.error || 'Could not update setting');
    }
  }

  async function sendPaymentLink(appointmentId) {
    try {
      const { data } = await api.post(`/scheduling/appointments/${appointmentId}/payments/intent`, {
        mode: 'advance',
      });
      setInfo(`Payment link sent: ${data.paymentLinkUrl}`);
    } catch (e) {
      setError(e.response?.data?.error || 'Could not create payment link');
    }
  }

  async function connectAppleCalendar(staffId) {
    try {
      await api.post('/scheduling/calendar/apple/connect', {
        appleId: appleForm.appleId,
        appPassword: appleForm.appPassword,
        staffId: staffId || undefined,
      });
      setAppleForm({ appleId: '', appPassword: '' });
      setInfo('Apple Calendar connected');
      await loadCalendar();
    } catch (e) {
      setError(e.response?.data?.error || 'Apple Calendar connection failed');
    }
  }

  async function applyApptFilters(e) {
    e?.preventDefault?.();
    try {
      await loadAppointments(apptFilter, 1);
      await loadPendingCount();
    } catch (err) {
      setError(err.response?.data?.error || 'Could not filter appointments');
    }
  }

  async function goToApptPage(page) {
    try {
      await loadAppointments(apptFilter, page);
    } catch (err) {
      setError(err.response?.data?.error || 'Could not load appointments');
    }
  }

  async function exportAppointmentsCsv() {
    try {
      const params = {};
      if (apptFilter.status) params.status = apptFilter.status;
      if (apptFilter.staffId) params.staffId = apptFilter.staffId;
      if (apptFilter.customerId) params.customerId = apptFilter.customerId;
      if (apptFilter.from) params.from = apptFilter.from;
      if (apptFilter.to) params.to = `${apptFilter.to}T23:59:59.999Z`;
      if (apptFilter.q) params.q = apptFilter.q;
      const { data } = await api.get('/scheduling/appointments/export.csv', {
        params,
        responseType: 'blob',
      });
      const url = URL.createObjectURL(data);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'appointments.csv';
      a.click();
      URL.revokeObjectURL(url);
      setInfo('Appointments exported');
    } catch (err) {
      setError(err.response?.data?.error || 'Export failed');
    }
  }

  async function toggleServiceActive(serviceId, isActive) {
    try {
      await api.patch(`/scheduling/services/${serviceId}`, { isActive });
      setInfo(isActive ? 'Service activated' : 'Service deactivated');
      await loadAll();
    } catch (err) {
      setError(err.response?.data?.error || 'Could not update service');
    }
  }

  async function saveSchedSettings(e) {
    e.preventDefault();
    try {
      const { data } = await api.patch('/scheduling/settings', {
        reminderTemplate: schedSettings?.reminderTemplate,
        confirmationTemplate: schedSettings?.confirmationTemplate,
        rebookingTemplate: schedSettings?.rebookingTemplate,
        templateLang: schedSettings?.templateLang,
        reminderChannels: schedSettings?.activeReminderChannels,
      });
      setSchedSettings(data);
      setInfo('Notification settings saved');
    } catch (e) {
      setError(e.response?.data?.error || 'Could not save settings');
    }
  }

  async function connectGoogleCalendar(staffId) {
    try {
      const { data } = await api.get('/scheduling/calendar/google/auth-url', {
        params: staffId ? { staffId } : {},
      });
      if (data?.url) window.location.href = data.url;
    } catch (e) {
      setError(e.response?.data?.error || 'Google Calendar is not configured');
    }
  }

  async function connectOutlookCalendar(staffId) {
    try {
      const { data } = await api.get('/scheduling/calendar/outlook/auth-url', {
        params: staffId ? { staffId } : {},
      });
      if (data?.url) window.location.href = data.url;
    } catch (e) {
      setError(e.response?.data?.error || 'Outlook Calendar is not configured');
    }
  }

  async function syncCalendar(connectionId) {
    try {
      const { data } = await api.post(`/scheduling/calendar/${connectionId}/sync`);
      setInfo(`Synced ${data.synced || 0} calendar blocks`);
      await loadCalendar();
    } catch (e) {
      setError(e.response?.data?.error || 'Sync failed');
    }
  }

  async function createAvailRule(e) {
    e.preventDefault();
    if (!selectedStaffId) return setError('Select a staff member first');
    try {
      await api.post(`/scheduling/staff/${selectedStaffId}/availability-rules`, ruleForm);
      setInfo('Availability rule added');
      await loadAvailRules(selectedStaffId);
    } catch (err) {
      setError(err.response?.data?.error || 'Could not create rule');
    }
  }

  async function deleteAvailRule(ruleId) {
    if (!selectedStaffId) return;
    try {
      await api.delete(`/scheduling/staff/${selectedStaffId}/availability-rules/${ruleId}`);
      await loadAvailRules(selectedStaffId);
    } catch (err) {
      setError(err.response?.data?.error || 'Could not delete rule');
    }
  }

  async function disconnectCalendar(connectionId) {
    try {
      await api.delete(`/scheduling/calendar/${connectionId}`);
      setInfo('Calendar disconnected');
      await loadCalendar();
    } catch (e) {
      setError(e.response?.data?.error || 'Disconnect failed');
    }
  }

  async function renewCalendarWebhook(connectionId) {
    try {
      const { data } = await api.post(`/scheduling/calendar/${connectionId}/renew-webhook`);
      setInfo(
        data?.webhookExpiresAt
          ? `Webhook renewed until ${new Date(data.webhookExpiresAt).toLocaleString('en-IN')}`
          : 'Webhook renewed',
      );
      await loadCalendar();
    } catch (e) {
      setError(e.response?.data?.error || 'Webhook renewal failed');
    }
  }

  async function createHolidayEntry(e) {
    e.preventDefault();
    if (!holidayForm.name || !holidayForm.startDate) {
      setError('Holiday name and start date required');
      return;
    }
    try {
      const endDate = holidayForm.endDate || holidayForm.startDate;
      await api.post('/scheduling/holidays', {
        name: holidayForm.name,
        locationId: holidayForm.locationId || null,
        startAt: `${holidayForm.startDate}T00:00:00.000Z`,
        endAt: `${endDate}T23:59:59.999Z`,
      });
      setInfo('Holiday added');
      setHolidayForm({ name: '', startDate: '', endDate: '', locationId: '' });
      const { data } = await api.get('/scheduling/holidays');
      setHolidays(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err.response?.data?.error || 'Could not add holiday');
    }
  }

  async function removeHoliday(id) {
    if (!window.confirm('Remove this holiday? Slots will become available again for those dates.')) return;
    try {
      await api.delete(`/scheduling/holidays/${id}`);
      setHolidays((prev) => prev.filter((h) => h.id !== id));
      setInfo('Holiday removed');
    } catch (err) {
      setError(err.response?.data?.error || 'Could not remove holiday');
    }
  }

  async function sendNotificationTest() {
    if (!notifTestApptId) return;
    setNotifTestBusy(true);
    setNotifTestResult(null);
    try {
      const { data } = await api.post(`/scheduling/appointments/${notifTestApptId}/notifications/send`);
      setNotifTestResult(data);
      setInfo('Test notifications sent');
    } catch (err) {
      setNotifTestResult({ error: err.response?.data?.error || 'Send failed' });
    } finally {
      setNotifTestBusy(false);
    }
  }

  function switchTab(id) {
    setTab(id);
    setSearchParams(id === 'appointments' ? {} : { tab: id });
  }

  function startEditLocation(loc) {
    setEditingLocationId(loc.id);
    // Back-compat: if loc has imageUrl but no mediaUrls, seed from imageUrl
    let urls = Array.isArray(loc.mediaUrls) ? loc.mediaUrls : [];
    if (urls.length === 0 && loc.imageUrl) urls = [loc.imageUrl];
    setLocationForm({
      code: loc.code || '',
      name: loc.name || '',
      timezone: loc.timezone || 'Asia/Kolkata',
      addressLine1: loc.addressLine1 || '',
      city: loc.city || '',
      phone: loc.phone || '',
      mediaUrls: urls,
      geoFenceEnabled: loc.geoFenceEnabled || false,
      allowedRadiusMeters: loc.allowedRadiusMeters || 100,
      outsideRadiusAction: loc.outsideRadiusAction || 'WARN',
    });
  }

  function cancelEditLocation() {
    setEditingLocationId('');
    setLocationForm({
      code: 'MAIN',
      name: 'Main Branch',
      timezone: 'Asia/Kolkata',
      addressLine1: '',
      city: '',
      phone: '',
      mediaUrls: [],
      geoFenceEnabled: false,
      allowedRadiusMeters: 100,
      outsideRadiusAction: 'WARN',
    });
  }

  async function createLocation(e) {
    e.preventDefault();
    try {
      if (editingLocationId) {
        await api.patch(`/scheduling/locations/${editingLocationId}`, {
          name: locationForm.name,
          timezone: locationForm.timezone,
          addressLine1: locationForm.addressLine1 || null,
          city: locationForm.city || null,
          phone: locationForm.phone || null,
          mediaUrls: locationForm.mediaUrls || [],
          geoFenceEnabled: locationForm.geoFenceEnabled,
          allowedRadiusMeters: parseInt(locationForm.allowedRadiusMeters, 10) || 100,
          outsideRadiusAction: locationForm.outsideRadiusAction,
        });
        setInfo('Location updated');
        cancelEditLocation();
      } else {
        await api.post('/scheduling/locations', {
          code: locationForm.code,
          name: locationForm.name,
          timezone: locationForm.timezone,
          addressLine1: locationForm.addressLine1 || null,
          city: locationForm.city || null,
          phone: locationForm.phone || null,
          mediaUrls: locationForm.mediaUrls || [],
          geoFenceEnabled: locationForm.geoFenceEnabled,
          allowedRadiusMeters: parseInt(locationForm.allowedRadiusMeters, 10) || 100,
          outsideRadiusAction: locationForm.outsideRadiusAction,
        });
        setInfo('Location created');
        cancelEditLocation();
      }
      await loadAll();
    } catch (err) {
      setError(err.response?.data?.error || 'Could not save location');
    }
  }

  async function archiveStaff(s) {
    if (!window.confirm(`Archive ${s.name}? They will be removed from booking and slot search.`)) return;
    try {
      await api.delete(`/scheduling/staff/${s.id}`);
      if (editingStaffId === s.id) cancelEditStaff();
      setInfo('Staff archived');
      await loadAll();
    } catch (err) {
      setError(err.response?.data?.error || 'Could not archive staff');
    }
  }

  async function toggleStaffActive(s) {
    try {
      const next = s.activeStatus === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
      await api.patch(`/scheduling/staff/${s.id}`, { activeStatus: next });
      setInfo(next === 'ACTIVE' ? 'Staff activated' : 'Staff deactivated');
      await loadAll();
    } catch (err) {
      setError(err.response?.data?.error || 'Could not update staff status');
    }
  }

  async function openAppointmentDetail(id) {
    setSelectedApptId(id);
    setApptDetail(null);
    setApptManageLink('');
    setApptDetailLoading(true);
    try {
      const [detailRes, linkRes] = await Promise.all([
        api.get(`/scheduling/appointments/${id}`),
        api.get(`/scheduling/appointments/${id}/manage-link`),
      ]);
      setApptDetail(detailRes.data);
      setApptManageLink(linkRes.data?.url || '');
    } catch (e) {
      setError(e.response?.data?.error || 'Could not load appointment');
      setSelectedApptId('');
    } finally {
      setApptDetailLoading(false);
    }
  }

  function closeAppointmentDetail() {
    setSelectedApptId('');
    setApptDetail(null);
    setApptManageLink('');
  }

  async function joinWaitlistEntry(e) {
    e.preventDefault();
    if (!waitlistForm.customerId || !waitlistForm.serviceId || !waitlistForm.locationId) {
      return setError('Customer, service, and location are required for waitlist');
    }
    try {
      await api.post('/scheduling/waitlist', {
        customerId: waitlistForm.customerId,
        serviceId: waitlistForm.serviceId,
        locationId: waitlistForm.locationId,
        staffId: waitlistForm.staffId || undefined,
        preferredDate: waitlistForm.preferredDate || undefined,
      });
      setInfo('Added to waitlist');
      setWaitlistForm({ customerId: '', serviceId: '', locationId: '', staffId: '', preferredDate: '' });
      const { data } = await api.get('/scheduling/waitlist');
      setWaitlist(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err.response?.data?.error || 'Could not join waitlist');
    }
  }

  async function removeWaitlistEntry(id) {
    try {
      await api.delete(`/scheduling/waitlist/${id}`);
      setInfo('Removed from waitlist');
      const { data } = await api.get('/scheduling/waitlist');
      setWaitlist(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err.response?.data?.error || 'Could not remove waitlist entry');
    }
  }

  async function exportWaitlistCsv() {
    try {
      const { data } = await api.get('/scheduling/waitlist/export.csv', { responseType: 'blob' });
      const url = URL.createObjectURL(data);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'waitlist.csv';
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e.response?.data?.error || 'Export failed');
    }
  }

  async function applyQuickFilter(preset) {
    const today = todayDateInput();
    let next = { status: '', staffId: '', customerId: '', from: '', to: '', q: '' };
    if (preset === 'pending') next.status = 'PENDING';
    else if (preset === 'today') {
      next.from = today;
      next.to = today;
    }
    setApptFilter(next);
    try {
      await loadAppointments(next, 1);
    } catch (err) {
      setError(err.response?.data?.error || 'Could not filter appointments');
    }
  }

  async function confirmAllPending() {
    if (!pendingCount) return;
    if (!window.confirm(`Confirm all ${pendingCount} pending appointment${pendingCount === 1 ? '' : 's'}? Customers will receive confirmation messages.`)) return;
    try {
      const { data } = await api.post('/scheduling/appointments/confirm-pending');
      setInfo(`Confirmed ${data.confirmed || 0} appointment${data.confirmed === 1 ? '' : 's'}${data.failed ? ` (${data.failed} failed)` : ''}`);
      await loadAppointments(apptFilter, apptPagination.page);
      await loadPendingCount();
    } catch (err) {
      setError(err.response?.data?.error || 'Bulk confirm failed');
    }
  }

  async function checkInTodayConfirmed() {
    const confirmedToday = todaySchedule.filter((a) => a.status === 'CONFIRMED').length;
    if (!confirmedToday) {
      setInfo('No confirmed appointments to check in today');
      return;
    }
    if (!window.confirm(`Check in ${confirmedToday} confirmed appointment${confirmedToday === 1 ? '' : 's'} for today?`)) return;
    try {
      const { data } = await api.post('/scheduling/appointments/check-in-today', {
        staffId: scheduleStaffId || undefined,
      });
      setInfo(`Checked in ${data.checkedIn || 0}${data.failed ? ` (${data.failed} failed)` : ''}`);
      await loadStaffSchedule(scheduleStaffId, weekStart);
      await loadAll();
    } catch (err) {
      setError(err.response?.data?.error || 'Bulk check-in failed');
    }
  }

  function bookAgainFromAppointment(appt) {
    if (!appt) return;
    setBookForm({
      customerId: appt.customerId || appt.customer?.id || '',
      serviceId: appt.serviceId || appt.service?.id || '',
      staffId: appt.staffId || appt.staff?.id || '',
      locationId: appt.locationId || appt.location?.id || '',
      date: todayDateInput(),
      slotStart: '',
      collectAdvance: false,
      notes: '',
    });
    setSlots([]);
    closeAppointmentDetail();
    setInfo('Booking form pre-filled — pick a date and find slots');
  }

  async function handleApptDropToDay(apptId, targetDayKey) {
    const appt = weekAppointments.find((a) => a.id === apptId);
    if (!appt || !['PENDING', 'CONFIRMED'].includes(appt.status)) return;
    if (localDayKey(appt.startAt) === targetDayKey) return;

    const orig = new Date(appt.startAt);
    const [y, m, d] = targetDayKey.split('-').map(Number);
    const target = new Date(y, m - 1, d, orig.getHours(), orig.getMinutes(), 0, 0);

    try {
      const { data } = await api.get('/scheduling/slots/available', {
        params: {
          serviceId: appt.serviceId,
          locationId: appt.locationId,
          staffId: appt.staffId,
          date: targetDayKey,
        },
      });
      const slots = Array.isArray(data?.slots) ? data.slots : [];
      const targetMs = target.getTime();
      const match = slots.find((s) => Math.abs(new Date(s.startAt).getTime() - targetMs) < 60000);

      if (match) {
        await api.post(`/scheduling/appointments/${appt.id}/reschedule`, {
          newStartAt: match.startAt,
          reason: 'Drag-and-drop from week view',
        });
        await loadStaffSchedule(scheduleStaffId, weekStart);
        setInfo('Appointment moved');
      } else {
        setWeekRescheduleAppt({ ...appt, _prefillDate: targetDayKey });
        setInfo('Pick an available slot for the new day');
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Could not move appointment');
    }
  }

  return (
    <div className="space-y-5 max-w-6xl">
      <PageHeader
        title="Scheduling"
        subtitle="Staff, services, smart slots, appointments, waitlist, and WhatsApp AI booking."
      />

      {error && (
        <div className="flex items-start gap-2.5 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 text-sm px-4 py-3">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
          {error}
        </div>
      )}
      {info && (
        <div className="flex items-start gap-2.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300 text-sm px-4 py-3">
          <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" />
          {info}
        </div>
      )}

      <div className="flex flex-wrap gap-1.5 border-b border-neutral-200 dark:border-neutral-800 pb-3">
        {TABS.map((t) => {
          const badge =
            t.id === 'appointments' && pendingCount > 0
              ? pendingCount
              : t.id === 'waitlist' && waitlist.length > 0
                ? waitlist.length
                : 0;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => switchTab(t.id)}
              className={[
                'rounded-xl px-3.5 py-2 text-sm font-medium inline-flex items-center gap-1.5 transition-colors',
                tab === t.id
                  ? 'bg-brand-600 text-white shadow-sm'
                  : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-200 dark:hover:bg-neutral-700',
              ].join(' ')}
            >
              {t.label}
              {badge > 0 && (
                <span
                  className={[
                    'rounded-full px-1.5 py-0.5 text-[10px] font-bold',
                    tab === t.id ? 'bg-white/20 text-white' : 'bg-brand-100 text-brand-800 dark:bg-brand-900/40 dark:text-brand-200',
                  ].join(' ')}
                >
                  {badge}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {loading ? (
        <div className="flex items-center gap-2.5 text-sm text-neutral-500 py-4">
          <Loader2 className="w-4 h-4 animate-spin" />
          Loading scheduling data…
        </div>
      ) : tab === 'appointments' ? (
        <div className="space-y-6">
          <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 space-y-3">
            <div className="font-semibold text-slate-900 dark:text-white">Public online booking</div>
            <p className="text-xs text-slate-500">
              Share a link so customers can book without WhatsApp. Enable when your services and locations are ready.
            </p>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={publicBooking.enabled}
                onChange={(e) => togglePublicBooking(e.target.checked)}
              />
              Enable public booking page
            </label>
            {publicBooking.enabled && (
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={publicBooking.collectAdvance}
                  onChange={(e) => togglePublicBookingAdvance(e.target.checked)}
                />
                Collect Razorpay advance on public bookings
              </label>
            )}
            {publicBooking.url && (
              <div className="flex flex-wrap gap-2 items-center">
                <input readOnly className="flex-1 min-w-0 rounded-xl border px-3 py-2 text-xs" value={publicBooking.url} />
                <button
                  type="button"
                  className="rounded-xl border px-3 py-2 text-xs font-semibold"
                  onClick={() => {
                    navigator.clipboard.writeText(publicBooking.url);
                    setInfo('Booking link copied');
                  }}
                >
                  Copy
                </button>
              </div>
            )}
          </div>
          <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 space-y-3">
            <div className="font-semibold text-slate-900 dark:text-white">Book appointment</div>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
              <select
                className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm"
                value={bookForm.customerId}
                onChange={(e) => setBookForm((f) => ({ ...f, customerId: e.target.value }))}
              >
                <option value="">Select customer</option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>{c.name || c.phone}</option>
                ))}
              </select>
              <form onSubmit={addQuickCustomer} className="sm:col-span-2 lg:col-span-3 grid sm:grid-cols-3 gap-2 rounded-xl border border-dashed border-slate-200 dark:border-slate-700 p-3">
                <input
                  placeholder="Phone (10 digits)"
                  className="rounded-lg border px-3 py-2 text-sm"
                  value={quickCustomerForm.phone}
                  onChange={(e) => setQuickCustomerForm((f) => ({ ...f, phone: e.target.value }))}
                />
                <input
                  placeholder="Name"
                  className="rounded-lg border px-3 py-2 text-sm"
                  value={quickCustomerForm.name}
                  onChange={(e) => setQuickCustomerForm((f) => ({ ...f, name: e.target.value }))}
                />
                <button
                  type="submit"
                  disabled={quickCustomerBusy}
                  className="rounded-lg bg-slate-100 dark:bg-slate-800 px-3 py-2 text-sm font-semibold disabled:opacity-50"
                >
                  {quickCustomerBusy ? 'Adding…' : 'Quick add customer'}
                </button>
              </form>
              {customerStats && bookForm.customerId && (
                <div className="sm:col-span-2 lg:col-span-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 px-3 py-2 text-xs text-slate-600 dark:text-slate-300">
                  {customerStats.totalVisits ?? 0} visits · ₹{Number(customerStats.lifetimeSpend || 0).toLocaleString('en-IN')} lifetime
                  {customerStats.lastVisitAt
                    ? ` · last ${new Date(customerStats.lastVisitAt).toLocaleDateString('en-IN')}`
                    : ''}
                  {customerStats.avgRating ? ` · ${Number(customerStats.avgRating).toFixed(1)}★ avg` : ''}
                </div>
              )}
              <select
                className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm"
                value={bookForm.serviceId}
                onChange={(e) => setBookForm((f) => ({ ...f, serviceId: e.target.value }))}
              >
                <option value="">Select service</option>
                {services.map((s) => (
                  <option key={s.id} value={s.id}>{s.name} ({s.durationMin}m)</option>
                ))}
              </select>
              <select
                className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm"
                value={bookForm.locationId}
                onChange={(e) => setBookForm((f) => ({ ...f, locationId: e.target.value }))}
              >
                <option value="">Any location</option>
                {locations.map((l) => (
                  <option key={l.id} value={l.id}>{l.name}</option>
                ))}
              </select>
              <select
                className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm"
                value={bookForm.staffId}
                onChange={(e) => setBookForm((f) => ({ ...f, staffId: e.target.value }))}
              >
                <option value="">Any staff</option>
                {staff.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
              <input
                type="date"
                className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm"
                value={bookForm.date}
                onChange={(e) => setBookForm((f) => ({ ...f, date: e.target.value }))}
              />
              <textarea
                placeholder="Notes (optional)"
                className="sm:col-span-2 lg:col-span-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm min-h-[60px]"
                value={bookForm.notes}
                onChange={(e) => setBookForm((f) => ({ ...f, notes: e.target.value }))}
              />
              <button type="button" onClick={loadSlots} className="rounded-xl bg-slate-900 dark:bg-white text-white dark:text-slate-900 px-4 py-2 text-sm font-semibold">
                Find slots
              </button>
              <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300 sm:col-span-2">
                <input
                  type="checkbox"
                  checked={bookForm.collectAdvance}
                  onChange={(e) => setBookForm((f) => ({ ...f, collectAdvance: e.target.checked }))}
                />
                Collect advance via Razorpay link (WhatsApp)
              </label>
            </div>
            {slots.length > 0 && (
              <div className="flex flex-wrap gap-2 pt-2">
                {slots.map((s) => (
                  <button
                    key={`${s.staffId}-${s.startAt}`}
                    type="button"
                    disabled={!bookForm.customerId}
                    onClick={() => createAppointmentFromSlot(s)}
                    className="rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-2 text-xs hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50"
                  >
                    {new Date(s.startAt).toLocaleString('en-IN', { hour: 'numeric', minute: '2-digit' })} · {s.staffName}
                  </button>
                ))}
              </div>
            )}
          </div>

          <form onSubmit={applyApptFilters} className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="font-semibold text-sm">Filter appointments</div>
              <div className="flex flex-wrap gap-2">
                {pendingCount > 0 && (
                  <button
                    type="button"
                    onClick={confirmAllPending}
                    className="text-xs font-semibold text-emerald-700 dark:text-emerald-300"
                  >
                    Confirm all pending ({pendingCount})
                  </button>
                )}
                <button type="button" onClick={exportAppointmentsCsv} className="text-xs font-semibold text-brand-600">
                  Export CSV
                </button>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {[
                { id: 'all', label: 'All' },
                { id: 'pending', label: 'Pending' },
                { id: 'today', label: 'Today' },
              ].map((q) => (
                <button
                  key={q.id}
                  type="button"
                  onClick={() => applyQuickFilter(q.id)}
                  className="rounded-lg border px-2.5 py-1 text-xs font-semibold hover:bg-slate-50 dark:hover:bg-slate-800"
                >
                  {q.label}
                </button>
              ))}
            </div>
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-2">
              <input
                type="search"
                placeholder="Search ref, name, phone"
                className="sm:col-span-2 lg:col-span-4 rounded-xl border px-3 py-2 text-sm"
                value={apptFilter.q}
                onChange={(e) => setApptFilter((f) => ({ ...f, q: e.target.value }))}
              />
              <select
                className="rounded-xl border px-3 py-2 text-sm"
                value={apptFilter.status}
                onChange={(e) => setApptFilter((f) => ({ ...f, status: e.target.value }))}
              >
                <option value="">All statuses</option>
                {STATUSES.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
              <select
                className="rounded-xl border px-3 py-2 text-sm"
                value={apptFilter.staffId}
                onChange={(e) => setApptFilter((f) => ({ ...f, staffId: e.target.value }))}
              >
                <option value="">All staff</option>
                {staff.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
              <select
                className="rounded-xl border px-3 py-2 text-sm sm:col-span-2"
                value={apptFilter.customerId}
                onChange={(e) => setApptFilter((f) => ({ ...f, customerId: e.target.value }))}
              >
                <option value="">All customers</option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>{c.name || c.phone}</option>
                ))}
              </select>
              <input
                type="date"
                className="rounded-xl border px-3 py-2 text-sm"
                value={apptFilter.from}
                onChange={(e) => setApptFilter((f) => ({ ...f, from: e.target.value }))}
              />
              <input
                type="date"
                className="rounded-xl border px-3 py-2 text-sm"
                value={apptFilter.to}
                onChange={(e) => setApptFilter((f) => ({ ...f, to: e.target.value }))}
              />
            </div>
            <button type="submit" className="rounded-xl bg-slate-900 text-white px-4 py-2 text-sm font-semibold">
              Apply filters
            </button>
            {apptFilter.customerId && (
              <div className="text-xs text-slate-500 flex flex-wrap items-center gap-2">
                Showing appointments for{' '}
                <span className="font-medium text-slate-700 dark:text-slate-200">
                  {customers.find((c) => c.id === apptFilter.customerId)?.name ||
                    customers.find((c) => c.id === apptFilter.customerId)?.phone ||
                    'selected customer'}
                </span>
                <button
                  type="button"
                  className="text-brand-600 font-semibold"
                  onClick={() => {
                    const next = { ...apptFilter, customerId: '' };
                    setApptFilter(next);
                    setSearchParams({});
                    void loadAppointments(next);
                  }}
                >
                  Clear
                </button>
              </div>
            )}
          </form>

          <AppointmentsTable
            appointments={appointments}
            pagination={apptPagination}
            onPageChange={goToApptPage}
            onStatus={patchStatus}
            onPayment={sendPaymentLink}
            onSelect={openAppointmentDetail}
          />
          {selectedApptId && (
            <AppointmentDetailPanel
              loading={apptDetailLoading}
              appointment={apptDetail}
              manageLink={apptManageLink}
              onClose={closeAppointmentDetail}
              onStatus={patchStatus}
              onPayment={sendPaymentLink}
              onRefresh={async () => {
                await openAppointmentDetail(selectedApptId);
                await loadAppointments(apptFilter, apptPagination.page);
                await loadPendingCount();
              }}
              onRescheduled={async () => {
                await loadAppointments(apptFilter, apptPagination.page);
                await loadPendingCount();
                closeAppointmentDetail();
              }}
              onBookAgain={bookAgainFromAppointment}
            />
          )}
        </div>
      ) : tab === 'schedule' ? (
        <div className="space-y-4">
          <AllStaffTodayPanel
            appointments={allStaffToday}
            onSelect={(id) => {
              switchTab('appointments');
              void openAppointmentDetail(id);
            }}
          />
          <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="font-semibold">Staff schedule</div>
              {todaySchedule.some((a) => a.status === 'CONFIRMED') && (
                <button
                  type="button"
                  onClick={checkInTodayConfirmed}
                  className="text-xs font-semibold text-brand-600"
                >
                  Check in all confirmed today ({todaySchedule.filter((a) => a.status === 'CONFIRMED').length})
                </button>
              )}
            </div>
            <select
              className="w-full max-w-xs rounded-xl border px-3 py-2 text-sm"
              value={scheduleStaffId}
              onChange={(e) => setScheduleStaffId(e.target.value)}
            >
              {staff.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>
          <WeekScheduleGrid
            weekStart={weekStart}
            appointments={weekAppointments}
            onApptClick={(id) => {
              const appt = weekAppointments.find((a) => a.id === id);
              if (appt) setWeekRescheduleAppt(appt);
            }}
            onApptDrop={handleApptDropToDay}
            onPrev={() => {
              const d = new Date(weekStart);
              d.setDate(d.getDate() - 7);
              setWeekStart(d);
            }}
            onNext={() => {
              const d = new Date(weekStart);
              d.setDate(d.getDate() + 7);
              setWeekStart(d);
            }}
            onToday={() => setWeekStart(startOfWeekMonday())}
          />
          <ScheduleList title="Today" rows={todaySchedule} empty="No appointments today." onSelect={(id) => { switchTab('appointments'); void openAppointmentDetail(id); }} />
          <ScheduleList title="Next 7 days" rows={upcomingSchedule} empty="Nothing upcoming this week." onSelect={(id) => { switchTab('appointments'); void openAppointmentDetail(id); }} />
          <HolidaysPanel
            holidays={holidays}
            locations={locations}
            form={holidayForm}
            onFormChange={setHolidayForm}
            onSubmit={createHolidayEntry}
            onRemove={removeHoliday}
          />
          {weekRescheduleAppt && (
            <WeekRescheduleModal
              appointment={weekRescheduleAppt}
              onClose={() => setWeekRescheduleAppt(null)}
              onRescheduled={async () => {
                setWeekRescheduleAppt(null);
                await loadStaffSchedule(scheduleStaffId, weekStart);
                setInfo('Appointment rescheduled');
              }}
              onOpenDetails={(id) => {
                setWeekRescheduleAppt(null);
                switchTab('appointments');
                void openAppointmentDetail(id);
              }}
            />
          )}
        </div>
      ) : tab === 'staff' ? (
        <div className="space-y-6">
          <div className="grid lg:grid-cols-2 gap-6">
            <form onSubmit={saveStaff} className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 space-y-3">
              <div className="font-semibold">{editingStaffId ? 'Edit staff' : 'Add staff'}</div>
              {['staffCode', 'name', 'mobile', 'designation', 'department'].map((field) => (
                <input
                  key={field}
                  placeholder={field}
                  className="w-full rounded-xl border border-slate-200 dark:border-slate-700 px-3 py-2 text-sm"
                  value={staffForm[field]}
                  onChange={(e) => setStaffForm((f) => ({ ...f, [field]: e.target.value }))}
                  disabled={Boolean(editingStaffId) && field === 'staffCode'}
                />
              ))}
              <textarea
                placeholder="Bio"
                rows={3}
                className="w-full rounded-xl border border-slate-200 dark:border-slate-700 px-3 py-2 text-sm"
                value={staffForm.bio}
                onChange={(e) => setStaffForm((f) => ({ ...f, bio: e.target.value }))}
              />
              <input
                placeholder="Skills (comma-separated)"
                className="w-full rounded-xl border border-slate-200 dark:border-slate-700 px-3 py-2 text-sm"
                value={staffForm.skills}
                onChange={(e) => setStaffForm((f) => ({ ...f, skills: e.target.value }))}
              />
              {staffForm.profilePicture && (
                <img
                  src={staffForm.profilePicture}
                  alt="Staff profile"
                  className="h-20 w-20 rounded-full object-cover border border-slate-200"
                />
              )}
              {editingStaffId && (
                <label className="block text-sm">
                  <span className="text-slate-600 dark:text-slate-400">Profile photo</span>
                  <input
                    type="file"
                    accept="image/*"
                    className="mt-1 block w-full text-sm"
                    disabled={staffPhotoUploading}
                    onChange={(e) => uploadStaffPhoto(e.target.files?.[0])}
                  />
                  {staffPhotoUploading && <span className="text-xs text-slate-500">Uploading…</span>}
                </label>
              )}
              <div className="flex gap-2">
                <button type="submit" className="rounded-xl bg-brand-600 text-white px-4 py-2 text-sm font-semibold">
                  {editingStaffId ? 'Save changes' : 'Create'}
                </button>
                {editingStaffId && (
                  <button type="button" onClick={cancelEditStaff} className="rounded-xl border px-4 py-2 text-sm">
                    Cancel
                  </button>
                )}
              </div>
            </form>
            <div className="rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 overflow-hidden">
              <div className="px-4 py-3 bg-neutral-50 dark:bg-neutral-800/60 border-b-2 border-neutral-200 dark:border-neutral-700 flex items-center gap-2">
                <span className="font-semibold text-sm text-neutral-900 dark:text-neutral-100">Team</span>
                <span className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full bg-neutral-200 dark:bg-neutral-700 text-neutral-600 dark:text-neutral-300 text-xs font-bold">{staff.length}</span>
              </div>
              <ul className="text-sm">
                {staff.map((s, i) => (
                  <li key={s.id} className={[
                    'group flex flex-wrap items-center justify-between gap-3 px-4 py-3.5 border-b border-neutral-100 dark:border-neutral-800/60 transition-colors',
                    i % 2 === 1 ? 'bg-neutral-50/40 dark:bg-neutral-800/20' : 'bg-white dark:bg-neutral-900',
                    'hover:bg-brand-50/30 dark:hover:bg-neutral-800/50',
                  ].join(' ')}>
                    <span className="flex items-center gap-3">
                      {s.profilePicture ? (
                        <img src={s.profilePicture} alt="" className="h-8 w-8 rounded-full object-cover ring-2 ring-neutral-200 dark:ring-neutral-700" />
                      ) : (
                        <div className="h-8 w-8 rounded-full bg-brand-100 dark:bg-brand-900/40 text-brand-700 dark:text-brand-300 text-xs font-bold flex items-center justify-center flex-shrink-0">
                          {(s.name || '?').charAt(0).toUpperCase()}
                        </div>
                      )}
                      <span>
                        <span className="font-semibold text-neutral-900 dark:text-neutral-100">{s.name}</span>
                        <span className="ml-1.5 font-mono text-xs text-neutral-500 dark:text-neutral-400">({s.staffCode})</span>
                        {(s.designation || s.department) && (
                          <span className="text-xs text-neutral-500 dark:text-neutral-400 ml-1.5">
                            {[s.designation, s.department].filter(Boolean).join(' · ')}
                          </span>
                        )}
                        {s.activeStatus === 'INACTIVE' && (
                          <span className="ml-2 inline-flex rounded-full px-1.5 py-0.5 text-[11px] font-semibold bg-warning-50 text-warning-700 dark:bg-warning-950/40 dark:text-warning-400">Inactive</span>
                        )}
                        {s.activeStatus === 'ARCHIVED' && (
                          <span className="ml-2 inline-flex rounded-full px-1.5 py-0.5 text-[11px] font-semibold bg-neutral-100 text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400">Archived</span>
                        )}
                      </span>
                    </span>
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      {s.activeStatus !== 'ARCHIVED' && (
                        <button
                          type="button"
                          className="px-2 py-1 rounded-lg text-xs font-semibold text-neutral-600 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-700 transition-colors"
                          onClick={() => toggleStaffActive(s)}
                        >
                          {s.activeStatus === 'ACTIVE' ? 'Deactivate' : 'Activate'}
                        </button>
                      )}
                      <button type="button" className="px-2 py-1 rounded-lg text-xs font-semibold text-brand-600 dark:text-brand-400 hover:bg-brand-50 dark:hover:bg-brand-950/30 transition-colors" onClick={() => startEditStaff(s)}>
                        Edit
                      </button>
                      <button type="button" className="px-2 py-1 rounded-lg text-xs font-semibold text-error-600 dark:text-error-400 hover:bg-error-50 dark:hover:bg-error-950/30 transition-colors" onClick={() => archiveStaff(s)}>
                        Archive
                      </button>
                    </div>
                  </li>
                ))}
                {!staff.length && (
                  <li className="px-4 py-10 text-center text-neutral-400 dark:text-neutral-500 text-sm">No staff yet. Create one above.</li>
                )}
              </ul>
            </div>
            <StaffAssignmentsPanel
              staff={staff}
              services={services}
              locations={locations}
              linkableUsers={linkableUsers}
              onSaved={() => loadAll().then(() => setInfo('Staff assignments updated'))}
              onError={setError}
            />
          </div>
          <StaffAvailabilityPanel
            staff={staff}
            locations={locations}
            onInfo={setInfo}
            onError={setError}
          />
          <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 space-y-3">
            <div className="font-semibold">Recurring availability (RRULE)</div>
            <select
              className="w-full rounded-xl border border-slate-200 dark:border-slate-700 px-3 py-2 text-sm"
              value={selectedStaffId}
              onChange={(e) => setSelectedStaffId(e.target.value)}
            >
              <option value="">Select staff</option>
              {staff.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
            {selectedStaffId && (
              <>
                <form onSubmit={createAvailRule} className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
                  <select
                    className="rounded-xl border px-3 py-2 text-sm"
                    value={ruleForm.preset}
                    onChange={(e) => setRuleForm((f) => ({ ...f, preset: e.target.value }))}
                  >
                    {RULE_PRESETS.map((p) => (
                      <option key={p.id} value={p.id}>{p.label}</option>
                    ))}
                  </select>
                  <input type="time" className="rounded-xl border px-3 py-2 text-sm" value={ruleForm.startTime} onChange={(e) => setRuleForm((f) => ({ ...f, startTime: e.target.value }))} />
                  <input type="time" className="rounded-xl border px-3 py-2 text-sm" value={ruleForm.endTime} onChange={(e) => setRuleForm((f) => ({ ...f, endTime: e.target.value }))} />
                  <button type="submit" className="rounded-xl bg-brand-600 text-white px-4 py-2 text-sm font-semibold">Add rule</button>
                </form>
                <ul className="space-y-2 text-sm">
                  {availRules.map((r) => (
                    <li key={r.id} className="flex justify-between gap-2 border-b border-slate-100 dark:border-slate-800 pb-2">
                      <span>{r.rrule} · {r.startTime}–{r.endTime}</span>
                      <button type="button" className="text-xs text-red-600" onClick={() => deleteAvailRule(r.id)}>Remove</button>
                    </li>
                  ))}
                  {!availRules.length && <li className="text-slate-500">No RRULE rules — working hours apply.</li>}
                </ul>
              </>
            )}
          </div>
        </div>
      ) : tab === 'services' ? (
        <div className="space-y-6">
        <div className="grid lg:grid-cols-2 gap-6">
          <form onSubmit={saveCategory} className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 space-y-3">
            <div className="font-semibold">{editingCategoryId ? 'Edit category' : 'Add category'}</div>
            <input
              placeholder="Category name"
              className="w-full rounded-xl border px-3 py-2 text-sm"
              value={categoryForm.name}
              onChange={(e) => setCategoryForm((f) => ({ ...f, name: e.target.value }))}
            />
            <input
              type="number"
              placeholder="Sort order"
              className="w-full rounded-xl border px-3 py-2 text-sm"
              value={categoryForm.sortOrder}
              onChange={(e) => setCategoryForm((f) => ({ ...f, sortOrder: Number(e.target.value) }))}
            />
            <div className="flex gap-2">
              <button type="submit" className="rounded-xl bg-brand-600 text-white px-4 py-2 text-sm font-semibold">
                {editingCategoryId ? 'Save' : 'Create'}
              </button>
              {editingCategoryId && (
                <button
                  type="button"
                  className="rounded-xl border px-4 py-2 text-sm"
                  onClick={() => {
                    setEditingCategoryId('');
                    setCategoryForm({ name: '', sortOrder: 0 });
                  }}
                >
                  Cancel
                </button>
              )}
            </div>
          </form>
          <div className="rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 overflow-hidden">
            <div className="px-4 py-3 bg-neutral-50 dark:bg-neutral-800/60 border-b-2 border-neutral-200 dark:border-neutral-700 flex items-center gap-2">
              <span className="font-semibold text-sm text-neutral-900 dark:text-neutral-100">Categories</span>
              <span className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full bg-neutral-200 dark:bg-neutral-700 text-neutral-600 dark:text-neutral-300 text-xs font-bold">{categories.length}</span>
            </div>
            <ul className="text-sm">
              {categories.map((c, i) => (
                <li key={c.id} className={[
                  'group flex flex-wrap items-center justify-between gap-2 px-4 py-3 border-b border-neutral-100 dark:border-neutral-800/60 transition-colors',
                  i % 2 === 1 ? 'bg-neutral-50/40 dark:bg-neutral-800/20' : 'bg-white dark:bg-neutral-900',
                  'hover:bg-brand-50/30 dark:hover:bg-neutral-800/50',
                ].join(' ')}>
                  <span>
                    <span className="font-medium text-neutral-900 dark:text-neutral-100">{c.name}</span>
                    <span className="ml-2 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-brand-100 dark:bg-brand-900/40 text-brand-700 dark:text-brand-300 text-[11px] font-bold">{c._count?.services ?? 0}</span>
                    <span className="ml-1 text-xs text-neutral-400 dark:text-neutral-500">service{(c._count?.services ?? 0) !== 1 ? 's' : ''}</span>
                  </span>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      type="button"
                      className="px-2 py-1 rounded-lg text-xs font-semibold text-brand-600 dark:text-brand-400 hover:bg-brand-50 dark:hover:bg-brand-950/30 transition-colors"
                      onClick={() => { setEditingCategoryId(c.id); setCategoryForm({ name: c.name, sortOrder: c.sortOrder ?? 0 }); }}
                    >
                      Edit
                    </button>
                    <button type="button" className="px-2 py-1 rounded-lg text-xs font-semibold text-error-600 dark:text-error-400 hover:bg-error-50 dark:hover:bg-error-950/30 transition-colors" onClick={() => deleteCategory(c.id)}>
                      Delete
                    </button>
                  </div>
                </li>
              ))}
              {!categories.length && <li className="px-4 py-8 text-center text-neutral-400 dark:text-neutral-500 text-sm">No categories yet.</li>}
            </ul>
          </div>
        </div>
        <div className="grid lg:grid-cols-2 gap-6">
          <form onSubmit={createService} className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 space-y-3">
            <div className="font-semibold">{editingServiceId ? 'Edit service' : 'Add service'}</div>
            <input placeholder="Code" className="w-full rounded-xl border px-3 py-2 text-sm" value={serviceForm.code} onChange={(e) => setServiceForm((f) => ({ ...f, code: e.target.value }))} disabled={Boolean(editingServiceId)} />
            <input placeholder="Name" className="w-full rounded-xl border px-3 py-2 text-sm" value={serviceForm.name} onChange={(e) => setServiceForm((f) => ({ ...f, name: e.target.value }))} />
            <select
              className="w-full rounded-xl border px-3 py-2 text-sm"
              value={serviceForm.categoryId}
              onChange={(e) => setServiceForm((f) => ({ ...f, categoryId: e.target.value }))}
            >
              <option value="">No category</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
            <input type="number" placeholder="Duration (min)" className="w-full rounded-xl border px-3 py-2 text-sm" value={serviceForm.durationMin} onChange={(e) => setServiceForm((f) => ({ ...f, durationMin: Number(e.target.value) }))} />
            <input type="number" placeholder="Price" className="w-full rounded-xl border px-3 py-2 text-sm" value={serviceForm.price} onChange={(e) => setServiceForm((f) => ({ ...f, price: Number(e.target.value) }))} />
            <input
              type="number"
              min="1"
              placeholder="Rebooking interval (days, optional)"
              className="w-full rounded-xl border px-3 py-2 text-sm"
              value={serviceForm.rebookingIntervalDays}
              onChange={(e) => setServiceForm((f) => ({ ...f, rebookingIntervalDays: e.target.value }))}
            />
            <p className="text-xs text-slate-500">Used by AI rebooking campaigns — e.g. 30 for monthly touch-ups.</p>
            {/* Service media */}
            <div className="space-y-1.5">
              <p className="text-xs font-medium text-neutral-700 dark:text-neutral-300">Service photo / video (optional)</p>
              <div className="flex items-center gap-3 flex-wrap">
                {serviceForm.imageUrl && (
                  isVideoUrl(serviceForm.imageUrl) ? (
                    <video
                      src={serviceForm.imageUrl}
                      className="h-14 w-14 rounded-xl object-cover border border-neutral-200 dark:border-neutral-700 shrink-0"
                      muted playsInline preload="metadata"
                    />
                  ) : (
                    <img src={serviceForm.imageUrl} alt="Service preview" className="h-14 w-14 rounded-xl object-cover border border-neutral-200 dark:border-neutral-700 shrink-0" />
                  )
                )}
                <label className={[
                  'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-neutral-300 dark:border-neutral-600 text-xs font-medium cursor-pointer transition-colors',
                  serviceImageUploading ? 'opacity-50 pointer-events-none' : 'hover:bg-neutral-50 dark:hover:bg-neutral-800',
                ].join(' ')}>
                  {serviceImageUploading ? '⏳ Uploading…' : '📎 Upload photo / video'}
                  <input type="file" accept="image/*,video/mp4,video/quicktime,video/webm" className="hidden" onChange={(e) => uploadServiceImage(e.target.files?.[0])} disabled={serviceImageUploading} />
                </label>
                {serviceForm.imageUrl && (
                  <button type="button" className="text-xs text-error-500 hover:text-error-700 transition-colors" onClick={() => setServiceForm((f) => ({ ...f, imageUrl: '' }))}>Remove</button>
                )}
              </div>
            </div>
            <div className="flex gap-2">
              <button type="submit" className="rounded-xl bg-brand-600 text-white px-4 py-2 text-sm font-semibold">
                {editingServiceId ? 'Save changes' : 'Create'}
              </button>
              {editingServiceId && (
                <button type="button" onClick={cancelEditService} className="rounded-xl border px-4 py-2 text-sm">
                  Cancel
                </button>
              )}
            </div>
          </form>
          <div className="rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 overflow-hidden">
            <div className="px-4 py-3 bg-neutral-50 dark:bg-neutral-800/60 border-b-2 border-neutral-200 dark:border-neutral-700 flex items-center gap-2">
              <span className="font-semibold text-sm text-neutral-900 dark:text-neutral-100">Services</span>
              <span className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full bg-neutral-200 dark:bg-neutral-700 text-neutral-600 dark:text-neutral-300 text-xs font-bold">{services.length}</span>
            </div>
            <ul className="text-sm">
              {services.map((s, i) => (
                <li key={s.id} className={[
                  'group flex flex-wrap items-center justify-between gap-3 px-4 py-3.5 border-b border-neutral-100 dark:border-neutral-800/60 transition-colors',
                  i % 2 === 1 ? 'bg-neutral-50/40 dark:bg-neutral-800/20' : 'bg-white dark:bg-neutral-900',
                  'hover:bg-brand-50/30 dark:hover:bg-neutral-800/50',
                ].join(' ')}>
                  <div className="flex items-center gap-3 min-w-0">
                    {s.imageUrl ? (
                      isVideoUrl(s.imageUrl) ? (
                        <video src={s.imageUrl} className="h-10 w-10 rounded-lg object-cover border border-neutral-200 dark:border-neutral-700 shrink-0" muted playsInline preload="metadata" />
                      ) : (
                        <img src={s.imageUrl} alt={s.name} className="h-10 w-10 rounded-lg object-cover border border-neutral-200 dark:border-neutral-700 shrink-0" />
                      )
                    ) : (
                      <div className="h-10 w-10 rounded-lg bg-brand-50 dark:bg-brand-950/40 flex items-center justify-center shrink-0 text-brand-400 text-xs font-bold border border-brand-100 dark:border-brand-900">{s.name.charAt(0).toUpperCase()}</div>
                    )}
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-neutral-900 dark:text-neutral-100">{s.name}</span>
                        {s.category?.name && (
                          <span className="text-xs text-neutral-400 dark:text-neutral-500">in {s.category.name}</span>
                        )}
                        {!s.isActive && (
                          <span className="inline-flex rounded-full px-1.5 py-0.5 text-[11px] font-semibold bg-warning-50 text-warning-700 dark:bg-warning-950/40 dark:text-warning-400">Inactive</span>
                        )}
                      </div>
                      <div className="flex items-center gap-3 mt-0.5 text-xs text-neutral-500 dark:text-neutral-400">
                        <span>⏱ {s.durationMin}m</span>
                        <span className="font-semibold text-emerald-700 dark:text-emerald-400">₹{Number(s.price).toLocaleString('en-IN')}</span>
                        {s.rebookingIntervalDays && <span>↩ every {s.rebookingIntervalDays}d</span>}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button type="button" className="px-2 py-1 rounded-lg text-xs font-semibold text-brand-600 dark:text-brand-400 hover:bg-brand-50 dark:hover:bg-brand-950/30 transition-colors" onClick={() => startEditService(s)}>
                      Edit
                    </button>
                    <button
                      type="button"
                      className="px-2 py-1 rounded-lg text-xs font-semibold text-neutral-600 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-700 transition-colors"
                      onClick={() => toggleServiceActive(s.id, !s.isActive)}
                    >
                      {s.isActive === false ? 'Activate' : 'Deactivate'}
                    </button>
                  </div>
                </li>
              ))}
              {!services.length && <li className="px-4 py-8 text-center text-neutral-400 dark:text-neutral-500 text-sm">No services yet.</li>}
            </ul>
          </div>
        </div>
        </div>
      ) : tab === 'products' ? (
        <div className="space-y-6">
          <div className="grid lg:grid-cols-2 gap-6">
            {/* Product form */}
            <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-3">
              <div className="font-semibold text-neutral-900 dark:text-neutral-100">
                {editingProductIdx >= 0 ? 'Edit product' : 'Add product'}
              </div>
              <input
                placeholder="Product name *"
                className="w-full rounded-xl border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                value={productForm.name}
                onChange={(e) => setProductForm((f) => ({ ...f, name: e.target.value }))}
              />
              <input
                placeholder="Price (e.g. ₹499)"
                className="w-full rounded-xl border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                value={productForm.price}
                onChange={(e) => setProductForm((f) => ({ ...f, price: e.target.value }))}
              />
              <textarea
                rows={2}
                placeholder="Description (optional)"
                className="w-full rounded-xl border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 resize-none"
                value={productForm.description}
                onChange={(e) => setProductForm((f) => ({ ...f, description: e.target.value }))}
              />
              {/* Media upload */}
              <div className="space-y-1.5">
                <p className="text-xs font-medium text-neutral-700 dark:text-neutral-300">Product photo / video (optional)</p>
                <div className="flex items-center gap-3 flex-wrap">
                  {productForm.imageUrl && (
                    isVideoUrl(productForm.imageUrl) ? (
                      <video
                        src={productForm.imageUrl}
                        className="h-14 w-14 rounded-xl object-cover border border-neutral-200 dark:border-neutral-700 shrink-0"
                        muted playsInline preload="metadata"
                      />
                    ) : (
                      <img src={productForm.imageUrl} alt="Product preview" className="h-14 w-14 rounded-xl object-cover border border-neutral-200 dark:border-neutral-700 shrink-0" />
                    )
                  )}
                  <label className={[
                    'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-neutral-300 dark:border-neutral-600 text-xs font-medium cursor-pointer transition-colors',
                    productImageUploading ? 'opacity-50 pointer-events-none' : 'hover:bg-neutral-50 dark:hover:bg-neutral-800',
                  ].join(' ')}>
                    {productImageUploading ? '⏳ Uploading…' : '📎 Upload photo / video'}
                    <input
                      type="file"
                      accept="image/*,video/mp4,video/quicktime,video/webm"
                      className="hidden"
                      disabled={productImageUploading}
                      onChange={(e) => uploadProductImage(e.target.files?.[0], (url) => setProductForm((f) => ({ ...f, imageUrl: url })))}
                    />
                  </label>
                  {productForm.imageUrl && (
                    <button type="button" className="text-xs text-error-500 hover:text-error-700 transition-colors" onClick={() => setProductForm((f) => ({ ...f, imageUrl: '' }))}>Remove</button>
                  )}
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  className="rounded-xl bg-brand-600 text-white px-4 py-2 text-sm font-semibold hover:bg-brand-700 transition-colors"
                  onClick={() => {
                    if (!productForm.name.trim()) { setError('Product name is required'); return; }
                    let updated;
                    if (editingProductIdx >= 0) {
                      updated = products.map((p, i) => i === editingProductIdx ? { ...productForm } : p);
                    } else {
                      updated = [...products, { ...productForm }];
                    }
                    saveProducts(updated);
                    setProductForm({ name: '', price: '', description: '', imageUrl: '' });
                    setEditingProductIdx(-1);
                  }}
                >
                  {editingProductIdx >= 0 ? 'Save changes' : 'Add product'}
                </button>
                {editingProductIdx >= 0 && (
                  <button
                    type="button"
                    className="rounded-xl border border-neutral-300 dark:border-neutral-600 px-4 py-2 text-sm text-neutral-700 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-colors"
                    onClick={() => { setEditingProductIdx(-1); setProductForm({ name: '', price: '', description: '', imageUrl: '' }); }}
                  >
                    Cancel
                  </button>
                )}
              </div>
            </div>

            {/* Products list */}
            <div className="rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 overflow-hidden">
              <div className="px-4 py-3 bg-neutral-50 dark:bg-neutral-800/60 border-b-2 border-neutral-200 dark:border-neutral-700 flex items-center gap-2">
                <span className="font-semibold text-sm text-neutral-900 dark:text-neutral-100">Products</span>
                <span className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full bg-neutral-200 dark:bg-neutral-700 text-neutral-600 dark:text-neutral-300 text-xs font-bold">{products.length}</span>
              </div>
              <ul className="text-sm divide-y divide-neutral-100 dark:divide-neutral-800/60">
                {products.map((p, i) => (
                  <li key={i} className={[
                    'group flex items-center justify-between gap-3 px-4 py-3.5 transition-colors',
                    i % 2 === 1 ? 'bg-neutral-50/40 dark:bg-neutral-800/20' : 'bg-white dark:bg-neutral-900',
                    'hover:bg-brand-50/30 dark:hover:bg-neutral-800/50',
                  ].join(' ')}>
                    <div className="flex items-center gap-3 min-w-0">
                      {p.imageUrl ? (
                        isVideoUrl(p.imageUrl) ? (
                          <video src={p.imageUrl} className="h-10 w-10 rounded-lg object-cover border border-neutral-200 dark:border-neutral-700 shrink-0" muted playsInline preload="metadata" />
                        ) : (
                          <img src={p.imageUrl} alt={p.name} className="h-10 w-10 rounded-lg object-cover border border-neutral-200 dark:border-neutral-700 shrink-0" />
                        )
                      ) : (
                        <div className="h-10 w-10 rounded-lg bg-neutral-100 dark:bg-neutral-800 flex items-center justify-center shrink-0 text-neutral-400 text-xs font-bold border border-neutral-200 dark:border-neutral-700">{(p.name || '?').charAt(0).toUpperCase()}</div>
                      )}
                      <div className="min-w-0">
                        <div className="font-semibold text-neutral-900 dark:text-neutral-100 truncate">{p.name}</div>
                        <div className="flex items-center gap-2 mt-0.5 text-xs text-neutral-500 dark:text-neutral-400">
                          {p.price && <span className="font-semibold text-emerald-700 dark:text-emerald-400">{p.price}</span>}
                          {p.description && <span className="truncate">{p.description}</span>}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                      <button
                        type="button"
                        className="px-2 py-1 rounded-lg text-xs font-semibold text-brand-600 dark:text-brand-400 hover:bg-brand-50 dark:hover:bg-brand-950/30 transition-colors"
                        onClick={() => { setEditingProductIdx(i); setProductForm({ name: p.name || '', price: p.price || '', description: p.description || '', imageUrl: p.imageUrl || '' }); }}
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        className="px-2 py-1 rounded-lg text-xs font-semibold text-error-600 dark:text-error-400 hover:bg-error-50 dark:hover:bg-error-950/30 transition-colors"
                        onClick={() => saveProducts(products.filter((_, idx) => idx !== i))}
                      >
                        Delete
                      </button>
                    </div>
                  </li>
                ))}
                {!products.length && (
                  <li className="px-4 py-10 text-center text-neutral-400 dark:text-neutral-500 text-sm">
                    No products yet. Add your first product.
                  </li>
                )}
              </ul>
            </div>
          </div>
          <p className="text-xs text-neutral-400 dark:text-neutral-500">
            Products are shared with the AI assistant. When a customer asks about products, the AI will mention the name and price, and send the image if available.
          </p>
        </div>
      ) : tab === 'locations' ? (
        <div className="grid lg:grid-cols-2 gap-6">
          <form onSubmit={createLocation} className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 space-y-3">
            <div className="font-semibold">{editingLocationId ? 'Edit location' : 'Add location'}</div>
            <input placeholder="Code" className="w-full rounded-xl border px-3 py-2 text-sm" value={locationForm.code} onChange={(e) => setLocationForm((f) => ({ ...f, code: e.target.value }))} disabled={Boolean(editingLocationId)} />
            <input placeholder="Name" className="w-full rounded-xl border px-3 py-2 text-sm" value={locationForm.name} onChange={(e) => setLocationForm((f) => ({ ...f, name: e.target.value }))} />
            <input placeholder="Timezone (e.g. Asia/Kolkata)" className="w-full rounded-xl border px-3 py-2 text-sm" value={locationForm.timezone} onChange={(e) => setLocationForm((f) => ({ ...f, timezone: e.target.value }))} />
            <input placeholder="Address line" className="w-full rounded-xl border px-3 py-2 text-sm" value={locationForm.addressLine1} onChange={(e) => setLocationForm((f) => ({ ...f, addressLine1: e.target.value }))} />
            <div className="grid grid-cols-2 gap-2">
              <input placeholder="City" className="w-full rounded-xl border px-3 py-2 text-sm" value={locationForm.city} onChange={(e) => setLocationForm((f) => ({ ...f, city: e.target.value }))} />
              <input placeholder="Phone" className="w-full rounded-xl border px-3 py-2 text-sm" value={locationForm.phone} onChange={(e) => setLocationForm((f) => ({ ...f, phone: e.target.value }))} />
            </div>
            {/* Location media gallery */}
            <div className="space-y-2">
              <div className="text-xs font-semibold text-neutral-500 dark:text-neutral-400 uppercase tracking-wider">
                Photos / Videos ({(locationForm.mediaUrls || []).length})
              </div>
              {(locationForm.mediaUrls || []).length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {(locationForm.mediaUrls || []).map((url, idx) => (
                    <div key={idx} className="relative group">
                      {isVideoUrl(url) ? (
                        <video
                          src={url}
                          className="h-20 w-20 rounded-xl object-cover border border-neutral-200 dark:border-neutral-700"
                          muted playsInline preload="metadata"
                        />
                      ) : (
                        <img
                          src={url}
                          alt={`Media ${idx + 1}`}
                          className="h-20 w-20 rounded-xl object-cover border border-neutral-200 dark:border-neutral-700"
                        />
                      )}
                      {idx === 0 && (
                        <span className="absolute top-1 left-1 bg-brand-600/80 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-md">Cover</span>
                      )}
                      <button
                        type="button"
                        onClick={() => removeLocationMedia(idx)}
                        className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-neutral-900 dark:bg-neutral-100 text-white dark:text-neutral-900 text-xs font-bold flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow"
                        title="Remove"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <label className="flex items-center gap-2 cursor-pointer rounded-xl border border-dashed border-neutral-300 dark:border-neutral-600 bg-neutral-50 dark:bg-neutral-800 hover:border-brand-400 hover:bg-brand-50 dark:hover:bg-brand-950/20 px-3 py-2.5 transition-colors text-sm text-neutral-600 dark:text-neutral-400 w-full">
                {locationImageUploading ? (
                  <span className="text-brand-600 dark:text-brand-400">Uploading…</span>
                ) : (
                  <>📎 Add photo or video</>
                )}
                <input
                  type="file"
                  className="hidden"
                  accept="image/*,video/mp4,video/quicktime,video/webm"
                  multiple
                  disabled={locationImageUploading}
                  onChange={async (e) => {
                    const files = Array.from(e.target.files || []);
                    for (const f of files) await uploadLocationMedia(f);
                    e.target.value = '';
                  }}
                />
              </label>
            </div>
            {/* Geo-fence settings */}
            <div className="space-y-2 pt-1">
              <div className="text-xs font-semibold text-neutral-500 dark:text-neutral-400 uppercase tracking-wider">Geo-Fence</div>
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={locationForm.geoFenceEnabled}
                  onChange={e => setLocationForm(f => ({ ...f, geoFenceEnabled: e.target.checked }))}
                  className="rounded"
                />
                Enable geo-fencing for attendance check-in
              </label>
              {locationForm.geoFenceEnabled && (
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-xs text-neutral-500 mb-1">Allowed radius (metres)</label>
                    <input
                      type="number"
                      min={10}
                      max={5000}
                      value={locationForm.allowedRadiusMeters}
                      onChange={e => setLocationForm(f => ({ ...f, allowedRadiusMeters: e.target.value }))}
                      className="w-full rounded-xl border px-3 py-2 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-neutral-500 mb-1">Outside radius action</label>
                    <select
                      value={locationForm.outsideRadiusAction}
                      onChange={e => setLocationForm(f => ({ ...f, outsideRadiusAction: e.target.value }))}
                      className="w-full rounded-xl border px-3 py-2 text-sm bg-white dark:bg-neutral-900"
                    >
                      <option value="WARN">Warn (allow with warning)</option>
                      <option value="REQUIRE_APPROVAL">Require manager approval</option>
                      <option value="REJECT">Reject check-in</option>
                    </select>
                  </div>
                </div>
              )}
            </div>
            <div className="flex gap-2">
              <button type="submit" className="rounded-xl bg-brand-600 text-white px-4 py-2 text-sm font-semibold">
                {editingLocationId ? 'Save changes' : 'Create'}
              </button>
              {editingLocationId && (
                <button type="button" onClick={cancelEditLocation} className="rounded-xl border px-4 py-2 text-sm">
                  Cancel
                </button>
              )}
            </div>
          </form>
          <div className="rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 overflow-hidden">
            <div className="px-4 py-3 bg-neutral-50 dark:bg-neutral-800/60 border-b-2 border-neutral-200 dark:border-neutral-700 flex items-center gap-2">
              <span className="font-semibold text-sm text-neutral-900 dark:text-neutral-100">Locations</span>
              <span className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full bg-neutral-200 dark:bg-neutral-700 text-neutral-600 dark:text-neutral-300 text-xs font-bold">{locations.length}</span>
            </div>
            <ul className="text-sm">
              {locations.map((l, i) => (
                <li key={l.id} className={[
                  'group flex flex-wrap items-center justify-between gap-3 px-4 py-3.5 border-b border-neutral-100 dark:border-neutral-800/60 transition-colors',
                  i % 2 === 1 ? 'bg-neutral-50/40 dark:bg-neutral-800/20' : 'bg-white dark:bg-neutral-900',
                  'hover:bg-brand-50/30 dark:hover:bg-neutral-800/50',
                ].join(' ')}>
                  {(() => {
                    const urls = Array.isArray(l.mediaUrls) ? l.mediaUrls : (l.imageUrl ? [l.imageUrl] : []);
                    const cover = urls[0];
                    if (!cover) return null;
                    return isVideoUrl(cover) ? (
                      <video src={cover} className="h-10 w-10 rounded-lg object-cover border border-neutral-200 dark:border-neutral-700 shrink-0" muted playsInline preload="metadata" />
                    ) : (
                      <img src={cover} alt={l.name} className="h-10 w-10 rounded-lg object-cover border border-neutral-200 dark:border-neutral-700 shrink-0" />
                    );
                  })()}
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-neutral-900 dark:text-neutral-100">{l.name}</span>
                      <span className="font-mono text-xs text-neutral-400 dark:text-neutral-500">({l.code})</span>
                      {!l.isActive && (
                        <span className="inline-flex rounded-full px-1.5 py-0.5 text-[11px] font-semibold bg-warning-50 text-warning-700 dark:bg-warning-950/40 dark:text-warning-400">Inactive</span>
                      )}
                    </div>
                    <div className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">
                      🌍 {l.timezone || 'Asia/Kolkata'}
                      {l.addressLine1 && (
                        <span className="ml-2">{[l.addressLine1, l.city].filter(Boolean).join(', ')}{l.phone ? ` · ${l.phone}` : ''}</span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      type="button"
                      className="px-2 py-1 rounded-lg text-xs font-semibold text-neutral-600 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-700 transition-colors"
                      onClick={() => toggleLocationActive(l)}
                    >
                      {l.isActive ? 'Deactivate' : 'Activate'}
                    </button>
                    <button type="button" className="px-2 py-1 rounded-lg text-xs font-semibold text-brand-600 dark:text-brand-400 hover:bg-brand-50 dark:hover:bg-brand-950/30 transition-colors" onClick={() => startEditLocation(l)}>
                      Edit
                    </button>
                  </div>
                </li>
              ))}
              {!locations.length && <li className="px-4 py-8 text-center text-neutral-400 dark:text-neutral-500 text-sm">No locations yet.</li>}
            </ul>
          </div>
        </div>
      ) : tab === 'calendar' ? (
        <div className="space-y-6">
          <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 space-y-4">
            <div className="font-semibold">Connect calendar</div>
            <div className="flex flex-wrap gap-2 items-center">
              <select
                className="rounded-xl border px-3 py-2 text-sm"
                value={selectedStaffId}
                onChange={(e) => setSelectedStaffId(e.target.value)}
              >
                <option value="">Business calendar</option>
                {staff.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
              {calendarInfo.googleConfigured && (
                <button
                  type="button"
                  onClick={() => connectGoogleCalendar(selectedStaffId || undefined)}
                  className="rounded-xl bg-brand-600 text-white px-4 py-2 text-sm font-semibold"
                >
                  Connect Google
                </button>
              )}
              {calendarInfo.outlookConfigured && (
                <button
                  type="button"
                  onClick={() => connectOutlookCalendar(selectedStaffId || undefined)}
                  className="rounded-xl bg-slate-800 text-white px-4 py-2 text-sm font-semibold"
                >
                  Connect Outlook
                </button>
              )}
            </div>
            {!calendarInfo.googleConfigured && !calendarInfo.outlookConfigured && !calendarInfo.appleConfigured && (
              <p className="text-sm text-slate-500">
                Set Google or Outlook env vars on the server, or connect Apple Calendar below.
              </p>
            )}
          </div>
          {calendarInfo.appleConfigured && (
            <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 space-y-3">
              <div className="font-semibold">Apple Calendar (iCloud)</div>
              <p className="text-xs text-slate-500">
                Use your Apple ID and an app-specific password from appleid.apple.com → Sign-In and Security → App-Specific Passwords.
              </p>
              <input
                type="email"
                placeholder="Apple ID email"
                className="w-full rounded-xl border px-3 py-2 text-sm"
                value={appleForm.appleId}
                onChange={(e) => setAppleForm((f) => ({ ...f, appleId: e.target.value }))}
              />
              <input
                type="password"
                placeholder="App-specific password"
                className="w-full rounded-xl border px-3 py-2 text-sm"
                value={appleForm.appPassword}
                onChange={(e) => setAppleForm((f) => ({ ...f, appPassword: e.target.value }))}
              />
              <button
                type="button"
                onClick={() => connectAppleCalendar(selectedStaffId || undefined)}
                className="rounded-xl bg-slate-900 text-white px-4 py-2 text-sm font-semibold"
              >
                Connect Apple Calendar
              </button>
            </div>
          )}
          <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 space-y-4">
            <div className="font-semibold">Active connections</div>
            <ul className="space-y-2 text-sm">
              {calendarInfo.connections.map((c) => {
                const staffName = staff.find((s) => s.id === c.staffId)?.name || 'Business';
                const webhookExp = c.webhookExpiresAt ? new Date(c.webhookExpiresAt) : null;
                const webhookSoon = webhookExp && webhookExp.getTime() - Date.now() < 48 * 3600000;
                const supportsWebhook = c.provider === 'GOOGLE' || c.provider === 'OUTLOOK';
                return (
                  <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 dark:border-slate-800 pb-2">
                    <span>
                      {staffName} · {c.provider}
                      {c.externalEmail ? ` (${c.externalEmail})` : ''}
                      {' · '}last sync {c.lastSyncAt ? new Date(c.lastSyncAt).toLocaleString('en-IN') : 'never'}
                      {supportsWebhook && (
                        <span className={`block text-xs mt-0.5 ${webhookSoon ? 'text-amber-600' : 'text-slate-500'}`}>
                          Webhook: {webhookExp ? `expires ${webhookExp.toLocaleString('en-IN')}` : c.webhookChannelId ? 'active' : 'not registered'}
                          {webhookSoon ? ' — renew soon' : ''}
                        </span>
                      )}
                    </span>
                    <span className="flex gap-2">
                      {supportsWebhook && (
                        <button type="button" className="text-xs font-semibold text-slate-600" onClick={() => renewCalendarWebhook(c.id)}>
                          Renew webhook
                        </button>
                      )}
                      <button type="button" className="text-xs font-semibold text-brand-600" onClick={() => syncCalendar(c.id)}>Sync</button>
                      <button type="button" className="text-xs font-semibold text-red-600" onClick={() => disconnectCalendar(c.id)}>Disconnect</button>
                    </span>
                  </li>
                );
              })}
              {!calendarInfo.connections.length && <li className="text-slate-500">No calendars connected yet.</li>}
            </ul>
          </div>
        </div>
      ) : tab === 'notifications' ? (
        <div className="space-y-6 max-w-2xl">
          <form onSubmit={saveSchedSettings} className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 space-y-4">
            <div className="font-semibold">WhatsApp templates</div>
            <p className="text-xs text-slate-500">
              Each business (client) can use its own approved Meta template names and language.
              These settings are saved per account — env vars on the server are only optional fallbacks.
              Create matching templates in Meta Business Manager, then enter the exact names below.
            </p>
            {schedSettings && (
              <>
                <div className="space-y-2">
                  <div className="text-sm font-medium">Reminder channels</div>
                  <p className="text-xs text-slate-500">
                    Per-business override. Email needs SMTP env + customer email. SMS needs Twilio env.
                  </p>
                  {['WHATSAPP', 'EMAIL', 'SMS'].map((ch) => {
                    const key = ch.toLowerCase();
                    const optionOk = ch === 'WHATSAPP' || schedSettings.reminderChannelOptions?.[key];
                    const active = (schedSettings.activeReminderChannels || []).includes(ch);
                    return (
                      <label key={ch} className={`flex items-center gap-2 text-sm ${optionOk ? '' : 'opacity-50'}`}>
                        <input
                          type="checkbox"
                          checked={active}
                          disabled={!optionOk}
                          onChange={(e) => {
                            const next = new Set(schedSettings.activeReminderChannels || []);
                            if (e.target.checked) next.add(ch);
                            else next.delete(ch);
                            setSchedSettings((s) => ({
                              ...s,
                              activeReminderChannels: [...next],
                            }));
                          }}
                        />
                        {ch}{!optionOk ? ' (not configured on server)' : ''}
                      </label>
                    );
                  })}
                </div>
                <label className="block text-sm">
                  <span className="text-slate-600">Reminder template</span>
                  <input
                    className="mt-1 w-full rounded-xl border px-3 py-2 text-sm"
                    value={schedSettings.reminderTemplate || ''}
                    onChange={(e) => setSchedSettings((s) => ({ ...s, reminderTemplate: e.target.value }))}
                    placeholder="wapilot_appointment_reminder"
                  />
                </label>
                <label className="block text-sm">
                  <span className="text-slate-600">Confirmation template</span>
                  <input
                    className="mt-1 w-full rounded-xl border px-3 py-2 text-sm"
                    value={schedSettings.confirmationTemplate || ''}
                    onChange={(e) => setSchedSettings((s) => ({ ...s, confirmationTemplate: e.target.value }))}
                    placeholder="wapilot_appointment_confirmed"
                  />
                </label>
                <label className="block text-sm">
                  <span className="text-slate-600">Rebooking template</span>
                  <input
                    className="mt-1 w-full rounded-xl border px-3 py-2 text-sm"
                    value={schedSettings.rebookingTemplate || ''}
                    onChange={(e) => setSchedSettings((s) => ({ ...s, rebookingTemplate: e.target.value }))}
                    placeholder="wapilot_rebooking_nudge"
                  />
                </label>
                <label className="block text-sm">
                  <span className="text-slate-600">Template language code</span>
                  <input
                    className="mt-1 w-full rounded-xl border px-3 py-2 text-sm"
                    value={schedSettings.templateLang || 'en_US'}
                    onChange={(e) => setSchedSettings((s) => ({ ...s, templateLang: e.target.value }))}
                  />
                </label>
                <button type="submit" className="rounded-xl bg-brand-600 text-white px-4 py-2 text-sm font-semibold">
                  Save templates
                </button>
              </>
            )}
            {!schedSettings && <p className="text-sm text-slate-500">Loading…</p>}
          </form>
          {schedSettings?.metaTemplateSuggestions && (
            <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 space-y-4 text-sm">
              <div className="font-semibold">Suggested Meta template bodies</div>
              {Object.entries(schedSettings.metaTemplateSuggestions).map(([key, tpl]) => (
                <div key={key} className="border-b border-slate-100 dark:border-slate-800 pb-3">
                  <div className="font-medium capitalize">{key}</div>
                  <div className="text-xs text-slate-500">Name: {tpl.name} · {tpl.category} · {tpl.language}</div>
                  <pre className="mt-2 text-xs bg-slate-50 dark:bg-slate-950 p-2 rounded-lg whitespace-pre-wrap">{tpl.body}</pre>
                  <div className="text-xs text-slate-500 mt-1">Variables: {tpl.variables.join(', ')}</div>
                </div>
              ))}
            </div>
          )}
          <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 space-y-3">
            <div className="font-semibold">Test notifications</div>
            <p className="text-xs text-slate-500">
              Send a confirmation and test reminder for a real appointment to verify templates and channel config.
            </p>
            <select
              className="w-full rounded-xl border px-3 py-2 text-sm"
              value={notifTestApptId}
              onChange={(e) => setNotifTestApptId(e.target.value)}
            >
              <option value="">Select an upcoming appointment…</option>
              {notifTestAppointments.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.appointmentNumber} · {a.customer?.name || a.customer?.phone} · {new Date(a.startAt).toLocaleString('en-IN')}
                  </option>
                ))}
            </select>
            <button
              type="button"
              disabled={!notifTestApptId || notifTestBusy}
              onClick={sendNotificationTest}
              className="rounded-xl bg-brand-600 text-white px-4 py-2 text-sm font-semibold disabled:opacity-50"
            >
              {notifTestBusy ? 'Sending…' : 'Send test confirmation & reminder'}
            </button>
            {notifTestResult && !notifTestResult.error && (
              <div className="text-xs text-emerald-700 dark:text-emerald-300">
                Confirmation: {(notifTestResult.confirmation || []).join(', ') || 'none'} · Reminder: {(notifTestResult.reminder || []).join(', ') || 'none'}
              </div>
            )}
            {notifTestResult?.error && (
              <div className="text-xs text-red-600">{notifTestResult.error}</div>
            )}
          </div>
        </div>
      ) : tab === 'waitlist' ? (
        <WaitlistPanel
          entries={waitlist}
          customers={customers}
          services={services}
          locations={locations}
          staff={staff}
          form={waitlistForm}
          onFormChange={setWaitlistForm}
          onSubmit={joinWaitlistEntry}
          onRemove={removeWaitlistEntry}
          onExport={exportWaitlistCsv}
        />
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="font-semibold text-slate-900 dark:text-white">Analytics</div>
            <select
              className="rounded-xl border px-3 py-2 text-sm"
              value={analyticsDays}
              onChange={(e) => setAnalyticsDays(Number(e.target.value))}
            >
              <option value={7}>Last 7 days</option>
              <option value={30}>Last 30 days</option>
              <option value={90}>Last 90 days</option>
            </select>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {analytics &&
              Object.entries(analytics)
                .filter(([k]) => k !== 'staffBreakdown' && k !== 'sourceBreakdown')
                .map(([k, v]) => (
                  <div key={k} className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
                    <div className="text-xs uppercase text-slate-500">{k.replace(/([A-Z])/g, ' $1')}</div>
                    <div className="text-2xl font-bold text-slate-900 dark:text-white mt-1">
                      {typeof v === 'number'
                        ? String(k).includes('Rate') || String(k).includes('Percent') || k === 'averageRating'
                          ? k === 'averageRating' && v
                            ? `${v} ★`
                            : `${v.toFixed(1)}%`
                          : v.toLocaleString('en-IN')
                        : v}
                    </div>
                  </div>
                ))}
          </div>
          {analytics?.sourceBreakdown?.length > 0 && (
            <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
              <div className="font-semibold mb-3">Bookings by source</div>
              <ul className="space-y-2 text-sm">
                {analytics.sourceBreakdown.map((s) => (
                  <li key={s.source} className="flex justify-between gap-2">
                    <span>{formatSourceLabel(s.source)}</span>
                    <span className="text-slate-500">{s.count}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {analytics?.staffBreakdown?.length > 0 && (
            <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
              <div className="font-semibold mb-3">Staff performance</div>
              <ul className="space-y-2 text-sm">
                {analytics.staffBreakdown.map((s) => (
                  <li key={s.staffId} className="flex justify-between gap-2">
                    <span>{s.staffName}</span>
                    <span className="text-slate-500">{s.completed} completed · ₹{s.revenue.toLocaleString('en-IN')}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {recentRatings.length > 0 && (
            <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
              <div className="font-semibold mb-3">Recent ratings</div>
              <ul className="space-y-2 text-sm">
                {recentRatings.map((r) => (
                  <li key={r.id} className="border-b border-slate-100 dark:border-slate-800 pb-2">
                    <div className="flex justify-between gap-2">
                      <span>{r.customer?.name || r.customer?.phone}</span>
                      <span className="text-amber-500 font-semibold">{r.rating} ★</span>
                    </div>
                    <div className="text-xs text-slate-500">
                      {r.service?.name} · {r.staff?.name} · {r.appointment?.appointmentNumber}
                      {r.feedback ? ` — “${r.feedback}”` : ''}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <button
            type="button"
            onClick={async () => {
              try {
                const { data } = await api.post('/scheduling/campaigns/rebooking', { limit: 10 });
                setInfo(`Rebooking campaign sent to ${data.sent} customers`);
              } catch (e) {
                setError(e.response?.data?.error || 'Campaign failed');
              }
            }}
            className="rounded-xl bg-brand-600 text-white px-4 py-2 text-sm font-semibold"
          >
            Send rebooking reminders (WhatsApp)
          </button>
        </div>
      )}
    </div>
  );
}

function AllStaffTodayPanel({ appointments, onSelect }) {
  const grouped = {};
  for (const a of appointments) {
    const key = a.staff?.name || 'Unassigned';
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(a);
  }
  const staffNames = Object.keys(grouped).sort();

  return (
    <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
      <div className="px-4 py-3 font-semibold border-b border-slate-100 dark:border-slate-800 flex justify-between gap-2">
        <span>All staff · today</span>
        <span className="text-xs font-normal text-slate-500">{appointments.length} appointments</span>
      </div>
      {!appointments.length ? (
        <p className="px-4 py-8 text-center text-sm text-slate-500">No appointments today.</p>
      ) : (
        <div className="divide-y divide-slate-100 dark:divide-slate-800">
          {staffNames.map((name) => (
            <div key={name} className="p-4">
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">{name}</div>
              <ul className="space-y-2 text-sm">
                {grouped[name].map((a) => (
                  <li key={a.id}>
                    <button
                      type="button"
                      className="w-full flex flex-wrap justify-between gap-2 text-left hover:bg-slate-50 dark:hover:bg-slate-800/40 rounded-lg px-2 py-1 -mx-2"
                      onClick={() => onSelect?.(a.id)}
                    >
                      <span>{a.customer?.name || a.customer?.phone} · {a.service?.name}</span>
                      <span className="text-slate-500">
                        {new Date(a.startAt).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })}
                        {' · '}{a.status}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function WeekRescheduleModal({ appointment, onClose, onRescheduled, onOpenDetails }) {
  const [rescheduleDate, setRescheduleDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [rescheduleSlots, setRescheduleSlots] = useState([]);
  const [busy, setBusy] = useState(false);
  const canMove = ['PENDING', 'CONFIRMED'].includes(appointment?.status);

  useEffect(() => {
    if (appointment?._prefillDate) {
      setRescheduleDate(appointment._prefillDate);
    } else if (appointment?.startAt) {
      setRescheduleDate(new Date(appointment.startAt).toISOString().slice(0, 10));
    }
    setRescheduleSlots([]);
  }, [appointment?.id, appointment?._prefillDate]);

  async function loadSlots() {
    if (!appointment?.serviceId || !rescheduleDate) return;
    setBusy(true);
    try {
      const { data } = await api.get('/scheduling/slots/available', {
        params: {
          serviceId: appointment.serviceId,
          locationId: appointment.locationId,
          staffId: appointment.staffId,
          date: rescheduleDate,
        },
      });
      setRescheduleSlots(Array.isArray(data.slots) ? data.slots : []);
    } finally {
      setBusy(false);
    }
  }

  async function moveTo(startAt) {
    if (!appointment?.id) return;
    setBusy(true);
    try {
      await api.post(`/scheduling/appointments/${appointment.id}/reschedule`, {
        newStartAt: startAt,
        reason: 'Rescheduled from week view',
      });
      await onRescheduled?.();
    } finally {
      setBusy(false);
    }
  }

  if (!appointment) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xl p-5 space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-2">
          <div>
            <div className="font-semibold text-lg">Move appointment</div>
            <div className="text-xs font-mono text-slate-500 mt-0.5">{appointment.appointmentNumber}</div>
          </div>
          <button type="button" onClick={onClose} className="text-slate-500 text-sm">Close</button>
        </div>
        <div className="text-sm space-y-1">
          <div className="font-medium">{appointment.customer?.name || appointment.customer?.phone}</div>
          <div className="text-slate-600 dark:text-slate-300">
            {appointment.service?.name} · {appointment.staff?.name}
          </div>
          <div>{new Date(appointment.startAt).toLocaleString('en-IN')}</div>
          <StatusBadge status={appointment.status} />
        </div>
        {canMove ? (
          <div className="space-y-2">
            <label className="block text-sm">
              <span className="text-slate-600">New date</span>
              <input
                type="date"
                className="mt-1 w-full rounded-xl border px-3 py-2 text-sm"
                value={rescheduleDate}
                onChange={(e) => {
                  setRescheduleDate(e.target.value);
                  setRescheduleSlots([]);
                }}
              />
            </label>
            <button
              type="button"
              disabled={busy}
              onClick={loadSlots}
              className="rounded-xl bg-slate-900 text-white px-4 py-2 text-sm font-semibold disabled:opacity-50"
            >
              Find slots
            </button>
            {rescheduleSlots.length > 0 && (
              <div className="flex flex-wrap gap-2 max-h-40 overflow-y-auto pt-1">
                {rescheduleSlots.map((s) => (
                  <button
                    key={`${s.staffId}-${s.startAt}`}
                    type="button"
                    disabled={busy}
                    onClick={() => moveTo(s.startAt)}
                    className="rounded-lg border px-2.5 py-1.5 text-xs hover:bg-brand-50 dark:hover:bg-brand-950/30 disabled:opacity-50"
                  >
                    {new Date(s.startAt).toLocaleString('en-IN', { hour: 'numeric', minute: '2-digit' })}
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : (
          <p className="text-sm text-slate-500">This appointment cannot be moved (status: {appointment.status}).</p>
        )}
        <button
          type="button"
          className="text-sm font-semibold text-brand-600"
          onClick={() => onOpenDetails?.(appointment.id)}
        >
          Open full details →
        </button>
      </div>
    </div>
  );
}

function HolidaysPanel({ holidays, locations, form, onFormChange, onSubmit, onRemove }) {
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const upcoming = holidays.filter((h) => new Date(h.endAt) >= todayStart);

  function formatHolidayRange(h) {
    const start = new Date(h.startAt).toLocaleDateString('en-IN');
    const end = new Date(h.endAt).toLocaleDateString('en-IN');
    return start === end ? start : `${start} – ${end}`;
  }

  return (
    <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 space-y-4">
      <div>
        <div className="font-semibold">Business holidays</div>
        <p className="text-xs text-slate-500 mt-1">
          Block all slots on these dates. Applies business-wide unless a specific location is chosen.
        </p>
      </div>
      <form onSubmit={onSubmit} className="grid sm:grid-cols-2 lg:grid-cols-4 gap-2">
        <input
          placeholder="Holiday name (e.g. Diwali)"
          className="sm:col-span-2 rounded-xl border px-3 py-2 text-sm"
          value={form.name}
          onChange={(e) => onFormChange((f) => ({ ...f, name: e.target.value }))}
        />
        <input
          type="date"
          className="rounded-xl border px-3 py-2 text-sm"
          value={form.startDate}
          onChange={(e) => onFormChange((f) => ({ ...f, startDate: e.target.value }))}
        />
        <input
          type="date"
          title="End date (optional)"
          className="rounded-xl border px-3 py-2 text-sm"
          value={form.endDate}
          onChange={(e) => onFormChange((f) => ({ ...f, endDate: e.target.value }))}
        />
        <select
          className="sm:col-span-2 rounded-xl border px-3 py-2 text-sm"
          value={form.locationId}
          onChange={(e) => onFormChange((f) => ({ ...f, locationId: e.target.value }))}
        >
          <option value="">All locations</option>
          {locations.map((l) => (
            <option key={l.id} value={l.id}>{l.name}</option>
          ))}
        </select>
        <button type="submit" className="rounded-xl bg-brand-600 text-white px-4 py-2 text-sm font-semibold">
          Add holiday
        </button>
      </form>
      <ul className="space-y-2 text-sm">
        {upcoming.map((h) => (
          <li key={h.id} className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 dark:border-slate-800 pb-2">
            <span>
              {h.name}
              {' · '}
              {formatHolidayRange(h)}
              {h.location ? ` · ${h.location.name}` : ' · All locations'}
            </span>
            <button type="button" className="text-xs font-semibold text-red-600" onClick={() => onRemove(h.id)}>
              Remove
            </button>
          </li>
        ))}
        {!upcoming.length && <li className="text-slate-500">No upcoming holidays.</li>}
      </ul>
    </div>
  );
}

function WeekScheduleGrid({ weekStart, appointments, onPrev, onNext, onToday, onApptClick, onApptDrop }) {
  const [dragOverDayKey, setDragOverDayKey] = useState('');
  const [draggingId, setDraggingId] = useState('');

  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + i);
    return d;
  });

  const weekLabel = `${days[0].toLocaleDateString('en-IN', { month: 'short', day: 'numeric' })} – ${days[6].toLocaleDateString('en-IN', { month: 'short', day: 'numeric', year: 'numeric' })}`;

  const byDay = {};
  for (const d of days) byDay[localDayKey(d)] = [];
  for (const a of appointments) {
    if (['CANCELLED', 'RESCHEDULED'].includes(a.status)) continue;
    const key = localDayKey(a.startAt);
    if (byDay[key]) byDay[key].push(a);
  }

  return (
    <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="font-semibold">Week view · {weekLabel}</div>
          <p className="text-[10px] text-slate-500 mt-0.5">Drag appointments to another day to reschedule</p>
        </div>
        <div className="flex gap-2 text-xs">
          <button type="button" onClick={onPrev} className="rounded-lg border px-2 py-1">← Prev</button>
          <button type="button" onClick={onToday} className="rounded-lg border px-2 py-1">Today</button>
          <button type="button" onClick={onNext} className="rounded-lg border px-2 py-1">Next →</button>
        </div>
      </div>
      <div className="grid grid-cols-7 divide-x divide-slate-100 dark:divide-slate-800 min-h-[140px]">
        {days.map((d) => {
          const key = localDayKey(d);
          const rows = byDay[key] || [];
          const isToday = key === localDayKey(new Date());
          return (
            <div
              key={key}
              className={[
                'p-2 text-xs min-h-[120px] transition-colors',
                isToday ? 'bg-brand-50/50 dark:bg-brand-950/20' : '',
                dragOverDayKey === key ? 'bg-brand-100/70 dark:bg-brand-900/40 ring-2 ring-inset ring-brand-400' : '',
              ].join(' ')}
              onDragOver={(e) => {
                if (!draggingId) return;
                e.preventDefault();
                setDragOverDayKey(key);
              }}
              onDragLeave={() => setDragOverDayKey((prev) => (prev === key ? '' : prev))}
              onDrop={(e) => {
                e.preventDefault();
                const apptId = e.dataTransfer.getData('text/appointment-id') || draggingId;
                setDragOverDayKey('');
                setDraggingId('');
                if (apptId && onApptDrop) onApptDrop(apptId, key);
              }}
            >
              <div className={`font-semibold mb-1 ${isToday ? 'text-brand-700 dark:text-brand-400' : 'text-slate-500'}`}>
                {d.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric' })}
              </div>
              <ul className="space-y-1">
                {rows.map((a) => {
                  const canDrag = ['PENDING', 'CONFIRMED'].includes(a.status);
                  return (
                    <li key={a.id}>
                      <button
                        type="button"
                        draggable={canDrag}
                        className={[
                          'w-full text-left rounded bg-slate-100 dark:bg-slate-800 px-1 py-0.5 truncate hover:bg-brand-50 dark:hover:bg-brand-950/30',
                          canDrag ? 'cursor-grab active:cursor-grabbing' : '',
                          draggingId === a.id ? 'opacity-50' : '',
                        ].join(' ')}
                        title={canDrag ? `${a.customer?.name || a.customer?.phone} — drag to move` : a.customer?.name || a.customer?.phone}
                        onClick={() => onApptClick?.(a.id)}
                        onDragStart={(e) => {
                          if (!canDrag) {
                            e.preventDefault();
                            return;
                          }
                          setDraggingId(a.id);
                          e.dataTransfer.setData('text/appointment-id', a.id);
                          e.dataTransfer.effectAllowed = 'move';
                        }}
                        onDragEnd={() => {
                          setDraggingId('');
                          setDragOverDayKey('');
                        }}
                      >
                        {new Date(a.startAt).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })}
                        {' '}{a.customer?.name?.split(' ')[0] || '—'}
                      </button>
                    </li>
                  );
                })}
                {!rows.length && <li className="text-slate-400">—</li>}
              </ul>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ScheduleList({ title, rows, empty, onSelect }) {
  return (
    <div className="rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 overflow-hidden">
      <div className="px-4 py-3 font-semibold text-neutral-900 dark:text-neutral-100 border-b-2 border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800/60 text-sm">
        {title}
        <span className="ml-2 inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full bg-neutral-200 dark:bg-neutral-700 text-neutral-600 dark:text-neutral-300 text-xs font-bold">
          {rows.length}
        </span>
      </div>
      <ul className="text-sm">
        {rows.map((a, i) => (
          <li key={a.id} className={[
            'border-b border-neutral-100 dark:border-neutral-800/60',
            i % 2 === 1 ? 'bg-neutral-50/40 dark:bg-neutral-800/20' : 'bg-white dark:bg-neutral-900',
          ].join(' ')}>
            <button
              type="button"
              className="group w-full px-4 py-3.5 flex flex-wrap justify-between gap-2 text-left hover:bg-brand-50/40 dark:hover:bg-neutral-800/50 transition-colors"
              onClick={() => onSelect?.(a.id)}
            >
              <div className="flex items-start gap-3">
                <div className="flex-shrink-0 w-8 h-8 rounded-full bg-brand-100 dark:bg-brand-900/40 text-brand-700 dark:text-brand-300 text-xs font-bold flex items-center justify-center mt-0.5">
                  {(a.customer?.name || a.customer?.phone || '?').charAt(0).toUpperCase()}
                </div>
                <div>
                  <div className="font-semibold text-neutral-900 dark:text-neutral-100 group-hover:text-brand-600 dark:group-hover:text-brand-400 transition-colors">
                    {a.customer?.name || a.customer?.phone}
                  </div>
                  <div className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">
                    {a.service?.name}{a.location?.name ? ` · ${a.location.name}` : ''}
                  </div>
                </div>
              </div>
              <div className="text-right shrink-0">
                <div className="text-xs font-medium text-neutral-600 dark:text-neutral-400">
                  {new Date(a.startAt).toLocaleString('en-IN', { hour: 'numeric', minute: '2-digit', day: 'numeric', month: 'short' })}
                </div>
                <div className="mt-1"><StatusBadge status={a.status} /></div>
              </div>
            </button>
          </li>
        ))}
        {!rows.length && (
          <li className="px-4 py-10 text-center text-neutral-400 dark:text-neutral-500 text-sm">{empty}</li>
        )}
      </ul>
    </div>
  );
}

function AppointmentsTable({ appointments, pagination, onPageChange, onStatus, onPayment, onSelect }) {
  const rangeStart = pagination?.total
    ? (pagination.page - 1) * pagination.pageSize + 1
    : 0;
  const rangeEnd = pagination?.total
    ? Math.min(pagination.page * pagination.pageSize, pagination.total)
    : appointments.length;

  return (
    <div className="rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-neutral-50 dark:bg-neutral-800/60 border-b-2 border-neutral-200 dark:border-neutral-700 text-left">
            <tr>
              {['Ref #', 'Customer', 'Service / Staff', 'When', 'Status', 'Payment', 'Actions'].map((h) => (
                <th key={h} className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400 whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {appointments.map((a, i) => (
              <tr key={a.id} className={[
                'group border-b border-neutral-100 dark:border-neutral-800/60 transition-colors',
                i % 2 === 1 ? 'bg-neutral-50/50 dark:bg-neutral-800/20' : 'bg-white dark:bg-neutral-900',
                'hover:bg-brand-50/30 dark:hover:bg-neutral-800/50',
              ].join(' ')}>
                <td className="px-4 py-3.5 font-mono">
                  <button
                    type="button"
                    className="text-xs font-bold text-brand-600 dark:text-brand-400 hover:text-brand-700 dark:hover:text-brand-300 hover:underline"
                    onClick={() => onSelect?.(a.id)}
                  >
                    #{a.appointmentNumber}
                  </button>
                </td>
                <td className="px-4 py-3.5">
                  <div className="flex items-center gap-2.5">
                    <div className="flex-shrink-0 w-8 h-8 rounded-full bg-brand-100 dark:bg-brand-900/40 text-brand-700 dark:text-brand-300 text-xs font-bold flex items-center justify-center">
                      {(a.customer?.name || a.customer?.phone || '?').charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <div className="font-semibold text-neutral-900 dark:text-neutral-100">{a.customer?.name || '—'}</div>
                      <div className="text-xs font-mono text-neutral-500 dark:text-neutral-400">{a.customer?.phone}</div>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3.5">
                  <div className="font-medium text-neutral-800 dark:text-neutral-200">{a.service?.name}</div>
                  <div className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">
                    {[a.staff?.name, a.location?.name].filter(Boolean).join(' · ')}
                  </div>
                  <div className="text-[10px] text-neutral-400 dark:text-neutral-500 mt-0.5">{formatSourceLabel(a.source)}</div>
                </td>
                <td className="px-4 py-3.5 text-xs text-neutral-600 dark:text-neutral-400 whitespace-nowrap">
                  {new Date(a.startAt).toLocaleString('en-IN', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                </td>
                <td className="px-4 py-3.5"><StatusBadge status={a.status} /></td>
                <td className="px-4 py-3.5">
                  <div className={[
                    'text-xs font-semibold',
                    a.paymentStatus === 'PAID' ? 'text-emerald-600 dark:text-emerald-400' : 'text-neutral-500 dark:text-neutral-400',
                  ].join(' ')}>{a.paymentStatus}</div>
                  {Number(a.amountDue) > 0 && (
                    <button
                      type="button"
                      className="mt-1 text-xs font-bold text-brand-600 dark:text-brand-400 hover:text-brand-700 dark:hover:text-brand-300 hover:underline"
                      onClick={() => onPayment(a.id)}
                    >
                      Send link
                    </button>
                  )}
                </td>
                <td className="px-4 py-3.5">
                  <select
                    className="rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 text-xs px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-brand-500/50 focus:border-brand-500 transition-colors"
                    value=""
                    onChange={(e) => e.target.value && onStatus(a.id, e.target.value)}
                  >
                    <option value="">Update status…</option>
                    {STATUSES.filter((s) => s !== a.status).map((s) => (
                      <option key={s} value={s}>{s.charAt(0) + s.slice(1).toLowerCase().replace(/_/g, ' ')}</option>
                    ))}
                  </select>
                </td>
              </tr>
            ))}
            {!appointments.length && (
              <tr>
                <td colSpan={7} className="px-4 py-12 text-center text-neutral-400 dark:text-neutral-500 text-sm">
                  No appointments found. Try adjusting your filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {pagination && pagination.totalPages > 1 && (
        <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 border-t border-neutral-100 dark:border-neutral-800 bg-neutral-50/50 dark:bg-neutral-800/30">
          <span className="text-xs text-neutral-500 dark:text-neutral-400">
            Showing <span className="font-semibold text-neutral-700 dark:text-neutral-300">{rangeStart}–{rangeEnd}</span> of <span className="font-semibold text-neutral-700 dark:text-neutral-300">{pagination.total}</span>
          </span>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              disabled={pagination.page <= 1}
              onClick={() => onPageChange?.(pagination.page - 1)}
              className="rounded-lg border border-neutral-200 dark:border-neutral-700 px-3 py-1.5 text-xs font-semibold text-neutral-600 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              ← Prev
            </button>
            <span className="text-xs text-neutral-500 dark:text-neutral-400 px-2">
              Page <span className="font-semibold text-neutral-700 dark:text-neutral-300">{pagination.page}</span> of <span className="font-semibold text-neutral-700 dark:text-neutral-300">{pagination.totalPages}</span>
            </span>
            <button
              type="button"
              disabled={!pagination.hasMore}
              onClick={() => onPageChange?.(pagination.page + 1)}
              className="rounded-lg border border-neutral-200 dark:border-neutral-700 px-3 py-1.5 text-xs font-semibold text-neutral-600 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              Next →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function StaffAssignmentsPanel({ staff, services, locations, linkableUsers, onSaved, onError }) {
  const [editingId, setEditingId] = useState('');
  const [serviceIds, setServiceIds] = useState([]);
  const [locationIds, setLocationIds] = useState([]);
  const [userId, setUserId] = useState('');
  const [saving, setSaving] = useState(false);

  function startEdit(member) {
    setEditingId(member.id);
    setServiceIds((member.services || []).map((s) => s.serviceId || s.service?.id).filter(Boolean));
    setLocationIds((member.locations || []).map((l) => l.locationId || l.location?.id).filter(Boolean));
    setUserId(member.user?.id || member.userId || '');
  }

  async function save(e) {
    e.preventDefault();
    if (!editingId) return;
    setSaving(true);
    onError('');
    try {
      await api.patch(`/scheduling/staff/${editingId}`, {
        serviceIds,
        locationIds,
        userId: userId || null,
      });
      setEditingId('');
      await onSaved();
    } catch (err) {
      onError(err.response?.data?.error || 'Could not update staff');
    }
    setSaving(false);
  }

  function toggleId(list, setList, id) {
    setList((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  return (
    <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 space-y-3">
      <div className="font-semibold">Team & assignments</div>
      <p className="text-xs text-slate-500">Link each staff member to services and locations — slots only show qualified staff.</p>
      <ul className="space-y-3 text-sm">
        {staff.map((s) => (
          <li key={s.id} className="border-b border-slate-100 dark:border-slate-800 pb-3">
            {editingId === s.id ? (
              <form onSubmit={save} className="space-y-2">
                <div className="font-medium">{s.name}</div>
                <div>
                  <div className="text-xs text-slate-500 mb-1">Services</div>
                  <div className="flex flex-wrap gap-2">
                    {services.map((svc) => (
                      <label key={svc.id} className="flex items-center gap-1 text-xs">
                        <input
                          type="checkbox"
                          checked={serviceIds.includes(svc.id)}
                          onChange={() => toggleId(serviceIds, setServiceIds, svc.id)}
                        />
                        {svc.name}
                      </label>
                    ))}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-slate-500 mb-1">Locations</div>
                  <div className="flex flex-wrap gap-2">
                    {locations.map((loc) => (
                      <label key={loc.id} className="flex items-center gap-1 text-xs">
                        <input
                          type="checkbox"
                          checked={locationIds.includes(loc.id)}
                          onChange={() => toggleId(locationIds, setLocationIds, loc.id)}
                        />
                        {loc.name}
                      </label>
                    ))}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-slate-500 mb-1">Login account (Staff day view)</div>
                  <select
                    className="w-full rounded-lg border px-2 py-1 text-xs"
                    value={userId}
                    onChange={(e) => setUserId(e.target.value)}
                  >
                    <option value="">No linked user</option>
                    {(linkableUsers || []).map((u) => (
                      <option key={u.id} value={u.id}>{u.email} ({u.role})</option>
                    ))}
                  </select>
                </div>
                <div className="flex gap-2">
                  <button type="submit" disabled={saving} className="rounded-lg bg-brand-600 text-white px-3 py-1 text-xs font-semibold disabled:opacity-50">
                    Save
                  </button>
                  <button type="button" onClick={() => setEditingId('')} className="rounded-lg border px-3 py-1 text-xs">
                    Cancel
                  </button>
                </div>
              </form>
            ) : (
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <div>{s.name} <span className="text-slate-500">({s.staffCode})</span></div>
                  <div className="text-xs text-slate-500 mt-0.5">
                    {(s.services || []).length
                      ? (s.services || []).map((x) => x.service?.name).filter(Boolean).join(', ')
                      : 'No services assigned'}
                    {' · '}
                    {(s.locations || []).length
                      ? (s.locations || []).map((x) => x.location?.name).filter(Boolean).join(', ')
                      : 'No locations'}
                    {s.user?.email ? ` · login: ${s.user.email}` : ''}
                  </div>
                </div>
                <button type="button" className="text-xs font-semibold text-brand-600" onClick={() => startEdit(s)}>
                  Assign
                </button>
              </div>
            )}
          </li>
        ))}
        {!staff.length && <li className="text-slate-500">No staff yet.</li>}
      </ul>
    </div>
  );
}

function AppointmentDetailPanel({ loading, appointment, manageLink, onClose, onStatus, onPayment, onRefresh, onRescheduled, onBookAgain }) {
  const [cashAmount, setCashAmount] = useState('');
  const [qrDataUrl, setQrDataUrl] = useState('');
  const [payBusy, setPayBusy] = useState(false);
  const [notes, setNotes] = useState('');
  const [internalNotes, setInternalNotes] = useState('');
  const [notesBusy, setNotesBusy] = useState(false);
  const [rescheduleOpen, setRescheduleOpen] = useState(false);
  const [rescheduleDate, setRescheduleDate] = useState('');
  const [rescheduleSlots, setRescheduleSlots] = useState([]);
  const [rescheduleBusy, setRescheduleBusy] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [cancelBusy, setCancelBusy] = useState(false);
  const [customerStats, setCustomerStats] = useState(null);
  const [notifyBusy, setNotifyBusy] = useState(false);
  const [notifyResult, setNotifyResult] = useState(null);

  useEffect(() => {
    if (appointment) {
      setNotes(appointment.notes || '');
      setInternalNotes(appointment.internalNotes || '');
      setRescheduleDate(new Date().toISOString().slice(0, 10));
      setRescheduleOpen(false);
      setRescheduleSlots([]);
      setCancelReason('');
      setNotifyResult(null);
    }
  }, [appointment?.id]);

  useEffect(() => {
    const customerId = appointment?.customer?.id || appointment?.customerId;
    if (!customerId) {
      setCustomerStats(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const { data } = await api.get(`/scheduling/customers/${customerId}/stats`);
        if (!cancelled) setCustomerStats(data);
      } catch {
        if (!cancelled) setCustomerStats(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [appointment?.customer?.id, appointment?.customerId]);

  async function recordCash(e) {
    e.preventDefault();
    if (!appointment?.id || !cashAmount) return;
    setPayBusy(true);
    try {
      await api.post(`/scheduling/appointments/${appointment.id}/payments`, {
        amount: Number(cashAmount),
        paymentMethod: 'CASH',
        status: 'PAID',
      });
      setCashAmount('');
      await onRefresh?.();
    } catch (err) {
      // parent shows errors via global state if needed
    } finally {
      setPayBusy(false);
    }
  }

  async function loadQr() {
    if (!appointment?.id) return;
    setPayBusy(true);
    try {
      const { data } = await api.post(`/scheduling/appointments/${appointment.id}/payments/qr`, { mode: 'advance' });
      setQrDataUrl(data.qrDataUrl || '');
    } finally {
      setPayBusy(false);
    }
  }

  async function saveNotes() {
    if (!appointment?.id) return;
    setNotesBusy(true);
    try {
      await api.patch(`/scheduling/appointments/${appointment.id}`, { notes, internalNotes });
      await onRefresh?.();
    } finally {
      setNotesBusy(false);
    }
  }

  async function loadRescheduleSlots() {
    if (!appointment?.serviceId || !rescheduleDate) return;
    setRescheduleBusy(true);
    try {
      const { data } = await api.get('/scheduling/slots/available', {
        params: {
          serviceId: appointment.serviceId,
          locationId: appointment.locationId,
          staffId: appointment.staffId,
          date: rescheduleDate,
        },
      });
      setRescheduleSlots(Array.isArray(data.slots) ? data.slots : []);
    } finally {
      setRescheduleBusy(false);
    }
  }

  async function doReschedule(startAt) {
    if (!appointment?.id) return;
    setRescheduleBusy(true);
    try {
      await api.post(`/scheduling/appointments/${appointment.id}/reschedule`, {
        newStartAt: startAt,
        reason: 'Rescheduled from dashboard',
      });
      await onRescheduled?.();
    } finally {
      setRescheduleBusy(false);
    }
  }

  async function downloadIcs() {
    if (!appointment?.id) return;
    try {
      const { data } = await api.get(`/scheduling/appointments/${appointment.id}/calendar.ics`, {
        responseType: 'blob',
      });
      const url = URL.createObjectURL(data);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${appointment.appointmentNumber || 'appointment'}.ics`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      // ignore
    }
  }

  async function doCancel() {
    if (!appointment?.id) return;
    setCancelBusy(true);
    try {
      await onStatus(appointment.id, 'CANCELLED', cancelReason);
      onClose?.();
    } finally {
      setCancelBusy(false);
    }
  }

  async function sendTestNotifications() {
    if (!appointment?.id) return;
    setNotifyBusy(true);
    setNotifyResult(null);
    try {
      const { data } = await api.post(`/scheduling/appointments/${appointment.id}/notifications/send`);
      setNotifyResult(data);
    } catch (err) {
      setNotifyResult({ error: err.response?.data?.error || 'Send failed' });
    } finally {
      setNotifyBusy(false);
    }
  }

  const canCancel = ['PENDING', 'CONFIRMED', 'CHECKED_IN', 'IN_PROGRESS'].includes(appointment?.status);

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/30" onClick={onClose}>
      <div
        className="w-full max-w-md h-full overflow-y-auto bg-white dark:bg-slate-900 shadow-xl border-l border-slate-200 dark:border-slate-800 p-5 space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-2">
          <div className="font-semibold text-lg">Appointment details</div>
          <button type="button" onClick={onClose} className="text-slate-500 hover:text-slate-800 text-sm">Close</button>
        </div>
        {loading && <p className="text-sm text-slate-500">Loading…</p>}
        {!loading && appointment && (
          <>
            <div className="space-y-1 text-sm">
              <div className="font-mono text-xs text-slate-500">{appointment.appointmentNumber}</div>
              <div className="font-medium">{appointment.customer?.name || appointment.customer?.phone}</div>
              {appointment.customer?.id && (
                <Link
                  to={`/conversations?customer=${encodeURIComponent(appointment.customer.id)}`}
                  className="text-xs font-semibold text-brand-600 hover:underline"
                >
                  Open WhatsApp chat →
                </Link>
              )}
              {appointment.customer?.id && (
                <Link
                  to={`/scheduling?tab=appointments&customerId=${encodeURIComponent(appointment.customer.id)}`}
                  className="text-xs font-semibold text-brand-600 hover:underline block"
                >
                  View all appointments →
                </Link>
              )}
              {customerStats && (
                <div className="rounded-lg bg-slate-50 dark:bg-slate-800/50 px-2.5 py-2 text-xs text-slate-600 dark:text-slate-300 mt-1 space-y-0.5">
                  <div className="font-medium text-slate-700 dark:text-slate-200">Customer history</div>
                  <div>{customerStats.totalVisits || 0} visits · ₹{Number(customerStats.lifetimeSpend || 0).toLocaleString('en-IN')} spent</div>
                  {customerStats.avgRating != null && (
                    <div>Avg rating: {Number(customerStats.avgRating).toFixed(1)} ★</div>
                  )}
                  {customerStats.lastVisitAt && (
                    <div>Last visit: {new Date(customerStats.lastVisitAt).toLocaleDateString('en-IN')}</div>
                  )}
                </div>
              )}
              <div className="text-slate-600 dark:text-slate-300">
                {appointment.service?.name} · {appointment.staff?.name}
              </div>
              <div>{new Date(appointment.startAt).toLocaleString('en-IN')} — {appointment.location?.name}</div>
              <div className="flex flex-wrap items-center gap-2 pt-0.5">
                <StatusBadge status={appointment.status} />
                <span className="text-[10px] rounded-full bg-slate-100 dark:bg-slate-800 px-2 py-0.5 text-slate-600 dark:text-slate-300">
                  {formatSourceLabel(appointment.source)}
                </span>
              </div>
              <button type="button" className="text-xs font-semibold text-brand-600 pt-1" onClick={downloadIcs}>
                Download calendar (.ics)
              </button>
              {onBookAgain && (
                <button
                  type="button"
                  className="block text-xs font-semibold text-brand-600 pt-1"
                  onClick={() => onBookAgain(appointment)}
                >
                  Book again for this customer →
                </button>
              )}
            </div>
            <div className="rounded-xl bg-slate-50 dark:bg-slate-800/50 p-3 text-sm space-y-1">
              <div className="font-medium">Payment</div>
              <div>{appointment.paymentStatus} · ₹{Number(appointment.amountPaid || 0).toLocaleString('en-IN')} paid</div>
              <div>Due: ₹{Number(appointment.amountDue || 0).toLocaleString('en-IN')}</div>
              {Number(appointment.amountDue) > 0 && (
                <div className="flex flex-wrap gap-3 pt-1">
                  <button type="button" className="text-brand-600 text-xs font-semibold" onClick={() => onPayment(appointment.id)}>
                    Send payment link
                  </button>
                  <button type="button" className="text-brand-600 text-xs font-semibold" onClick={loadQr} disabled={payBusy}>
                    Show QR
                  </button>
                </div>
              )}
              {qrDataUrl && (
                <img src={qrDataUrl} alt="Payment QR" className="mt-2 w-32 h-32 rounded border" />
              )}
              {Number(appointment.amountDue) > 0 && (
                <form onSubmit={recordCash} className="flex gap-2 pt-2">
                  <input
                    type="number"
                    min="1"
                    placeholder="Cash amount"
                    className="flex-1 rounded-lg border px-2 py-1 text-xs"
                    value={cashAmount}
                    onChange={(e) => setCashAmount(e.target.value)}
                  />
                  <button type="submit" disabled={payBusy} className="text-xs font-semibold text-brand-600">
                    Record cash
                  </button>
                </form>
              )}
            </div>
            {appointment.rating && (
              <div className="rounded-xl bg-amber-50 dark:bg-amber-950/30 p-3 text-sm">
                <div className="font-medium">Customer rating</div>
                <div className="text-amber-600 font-semibold">{appointment.rating.rating} ★</div>
                {appointment.rating.feedback && (
                  <p className="text-xs text-slate-600 mt-1">{appointment.rating.feedback}</p>
                )}
              </div>
            )}
            {appointment.payments?.length > 0 && (
              <div className="text-sm space-y-2">
                <div className="font-medium">Payment history</div>
                <ul className="space-y-1 text-xs text-slate-600 dark:text-slate-300">
                  {appointment.payments.map((p) => (
                    <li key={p.id}>
                      ₹{Number(p.amount).toLocaleString('en-IN')} · {p.paymentMethod} · {p.status}
                      {p.paidAt ? ` · ${new Date(p.paidAt).toLocaleString('en-IN')}` : ''}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {appointment.statusHistory?.length > 0 && (
              <div className="text-sm space-y-2">
                <div className="font-medium">Status history</div>
                <ul className="space-y-1 text-xs text-slate-600 dark:text-slate-300">
                  {appointment.statusHistory.map((h) => (
                    <li key={h.id}>
                      {h.fromStatus ? `${h.fromStatus} → ` : ''}{h.toStatus}
                      {h.reason ? ` (${h.reason})` : ''}
                      {' · '}{new Date(h.createdAt).toLocaleString('en-IN')}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {appointment.calendarEvents?.length > 0 && (
              <div className="text-sm space-y-1">
                <div className="font-medium">Calendar sync</div>
                {appointment.calendarEvents.map((ev) => (
                  <div key={ev.id} className="text-xs text-slate-500">
                    {ev.provider} · {ev.connection?.externalEmail || 'connected'}
                  </div>
                ))}
              </div>
            )}
            {appointment.reminders?.length > 0 && (
              <div className="text-sm space-y-2">
                <div className="font-medium">Reminders</div>
                <ul className="space-y-1 text-xs text-slate-600 dark:text-slate-300">
                  {appointment.reminders.map((r) => (
                    <li key={r.id}>
                      {r.channel} · {r.offsetMinutes}m before · {r.status}
                      {' · '}{new Date(r.scheduledAt).toLocaleString('en-IN')}
                      {r.sentAt ? ` · sent ${new Date(r.sentAt).toLocaleString('en-IN')}` : ''}
                      {r.failureReason ? ` · ${r.failureReason}` : ''}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <div className="text-sm space-y-2">
              <div className="font-medium">Send notifications now</div>
              <p className="text-xs text-slate-500">
                Sends confirmation (WhatsApp + email) and a test reminder on all active channels for this customer.
              </p>
              <button
                type="button"
                disabled={notifyBusy}
                onClick={sendTestNotifications}
                className="text-xs font-semibold text-brand-600 disabled:opacity-50"
              >
                {notifyBusy ? 'Sending…' : 'Send confirmation & test reminder'}
              </button>
              {notifyResult && !notifyResult.error && (
                <div className="text-xs text-emerald-700 dark:text-emerald-300">
                  Confirmation: {(notifyResult.confirmation || []).join(', ') || 'none'} · Reminder: {(notifyResult.reminder || []).join(', ') || 'none'}
                </div>
              )}
              {notifyResult?.error && (
                <div className="text-xs text-red-600">{notifyResult.error}</div>
              )}
            </div>
            {manageLink && (
              <div className="text-sm space-y-2">
                <div className="font-medium">Customer self-service link</div>
                <input readOnly className="w-full rounded-lg border px-2 py-1 text-xs" value={manageLink} />
                <button
                  type="button"
                  className="text-xs font-semibold text-brand-600"
                  onClick={() => navigator.clipboard.writeText(manageLink)}
                >
                  Copy link
                </button>
              </div>
            )}
            {appointment.notes && !rescheduleOpen && (
              <div className="text-sm">
                <div className="font-medium">Customer notes</div>
                <p className="text-slate-600 dark:text-slate-300 text-xs whitespace-pre-wrap">{appointment.notes}</p>
              </div>
            )}
            <div className="text-sm space-y-2">
              <div className="font-medium">Notes</div>
              <textarea
                placeholder="Customer-visible notes"
                className="w-full rounded-lg border px-2 py-1 text-xs min-h-[60px]"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
              <textarea
                placeholder="Internal notes (staff only)"
                className="w-full rounded-lg border px-2 py-1 text-xs min-h-[60px]"
                value={internalNotes}
                onChange={(e) => setInternalNotes(e.target.value)}
              />
              <button
                type="button"
                disabled={notesBusy}
                onClick={saveNotes}
                className="text-xs font-semibold text-brand-600"
              >
                Save notes
              </button>
            </div>
            {['PENDING', 'CONFIRMED'].includes(appointment.status) && (
              <div className="text-sm space-y-2 border-t border-slate-100 dark:border-slate-800 pt-3">
                <button
                  type="button"
                  className="text-xs font-semibold text-brand-600"
                  onClick={() => setRescheduleOpen((v) => !v)}
                >
                  {rescheduleOpen ? 'Cancel reschedule' : 'Reschedule appointment'}
                </button>
                {rescheduleOpen && (
                  <div className="space-y-2">
                    <input
                      type="date"
                      className="w-full rounded-lg border px-2 py-1 text-xs"
                      value={rescheduleDate}
                      onChange={(e) => setRescheduleDate(e.target.value)}
                    />
                    <button
                      type="button"
                      disabled={rescheduleBusy}
                      onClick={loadRescheduleSlots}
                      className="rounded-lg bg-slate-900 text-white px-3 py-1 text-xs font-semibold"
                    >
                      Find slots
                    </button>
                    <div className="flex flex-wrap gap-1">
                      {rescheduleSlots.map((s) => (
                        <button
                          key={`${s.staffId}-${s.startAt}`}
                          type="button"
                          disabled={rescheduleBusy}
                          onClick={() => doReschedule(s.startAt)}
                          className="rounded border px-2 py-1 text-xs"
                        >
                          {new Date(s.startAt).toLocaleString('en-IN', { hour: 'numeric', minute: '2-digit' })}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
            {canCancel && (
              <div className="text-sm space-y-2 border-t border-slate-100 dark:border-slate-800 pt-3">
                <div className="font-medium text-red-700 dark:text-red-400">Cancel appointment</div>
                <textarea
                  placeholder="Reason (optional)"
                  className="w-full rounded-lg border px-2 py-1 text-xs min-h-[56px]"
                  value={cancelReason}
                  onChange={(e) => setCancelReason(e.target.value)}
                />
                <button
                  type="button"
                  disabled={cancelBusy}
                  onClick={doCancel}
                  className="rounded-lg border border-red-200 text-red-700 px-3 py-1.5 text-xs font-semibold disabled:opacity-50"
                >
                  Cancel appointment
                </button>
              </div>
            )}
            <select
              className="w-full rounded-lg border text-sm px-3 py-2"
              value=""
              onChange={(e) => e.target.value && onStatus(appointment.id, e.target.value)}
            >
              <option value="">Update status…</option>
              {STATUSES.filter((s) => s !== appointment.status && s !== 'CANCELLED').map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </>
        )}
      </div>
    </div>
  );
}

function WaitlistPanel({ entries, customers, services, locations, staff, form, onFormChange, onSubmit, onRemove, onExport }) {
  return (
    <div className="grid lg:grid-cols-2 gap-6">
      <form onSubmit={onSubmit} className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 space-y-3">
        <div className="font-semibold">Join waitlist</div>
        <select
          className="w-full rounded-xl border px-3 py-2 text-sm"
          value={form.customerId}
          onChange={(e) => onFormChange((f) => ({ ...f, customerId: e.target.value }))}
        >
          <option value="">Select customer</option>
          {customers.map((c) => (
            <option key={c.id} value={c.id}>{c.name || c.phone}</option>
          ))}
        </select>
        <select
          className="w-full rounded-xl border px-3 py-2 text-sm"
          value={form.serviceId}
          onChange={(e) => onFormChange((f) => ({ ...f, serviceId: e.target.value }))}
        >
          <option value="">Select service</option>
          {services.map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>
        <select
          className="w-full rounded-xl border px-3 py-2 text-sm"
          value={form.locationId}
          onChange={(e) => onFormChange((f) => ({ ...f, locationId: e.target.value }))}
        >
          <option value="">Select location</option>
          {locations.map((l) => (
            <option key={l.id} value={l.id}>{l.name}</option>
          ))}
        </select>
        <select
          className="w-full rounded-xl border px-3 py-2 text-sm"
          value={form.staffId}
          onChange={(e) => onFormChange((f) => ({ ...f, staffId: e.target.value }))}
        >
          <option value="">Any staff (optional)</option>
          {staff.map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>
        <input
          type="date"
          className="w-full rounded-xl border px-3 py-2 text-sm"
          value={form.preferredDate}
          onChange={(e) => onFormChange((f) => ({ ...f, preferredDate: e.target.value }))}
        />
        <button type="submit" className="rounded-xl bg-brand-600 text-white px-4 py-2 text-sm font-semibold">
          Add to waitlist
        </button>
      </form>
      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          <div className="font-semibold">Active waitlist</div>
          {onExport && (
            <button type="button" onClick={onExport} className="text-xs font-semibold text-brand-600">
              Export CSV
            </button>
          )}
        </div>
        <ul className="space-y-2 text-sm">
          {entries.map((w) => (
            <li key={w.id} className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 dark:border-slate-800 pb-2">
              <span>
                {w.customer?.name || w.customer?.phone} · {w.service?.name} · {w.location?.name}
                {w.staff?.name ? ` · ${w.staff.name}` : ''}
                {' · '}{w.status}
                {w.preferredDate ? ` · prefers ${new Date(w.preferredDate).toLocaleDateString('en-IN')}` : ''}
              </span>
              <button type="button" className="text-xs font-semibold text-red-600" onClick={() => onRemove(w.id)}>
                Remove
              </button>
            </li>
          ))}
          {!entries.length && <li className="text-slate-500">No waitlist entries</li>}
        </ul>
      </div>
    </div>
  );
}

function StatusBadge({ status }) {
  return (
    <span className="inline-flex rounded-full bg-brand-50 text-brand-800 dark:bg-brand-900/40 dark:text-brand-200 px-2 py-0.5 text-xs font-semibold">
      {status}
    </span>
  );
}
