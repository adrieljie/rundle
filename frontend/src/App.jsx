import { useEffect, useState } from "react";
import "./App.css";

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8000";

const getStoredToken = () => {
  if (typeof window === "undefined") return "";
  return localStorage.getItem("token") || sessionStorage.getItem("token") || "";
};

const getStoredUser = () => {
  if (typeof window === "undefined") return null;

  const savedUser = localStorage.getItem("user") || sessionStorage.getItem("user");

  if (!savedUser) return null;

  try {
    return JSON.parse(savedUser);
  } catch {
    return null;
  }
};

const saveAuthSession = (token, user) => {
  localStorage.setItem("token", token);
  localStorage.setItem("user", JSON.stringify(user));
  sessionStorage.removeItem("token");
  sessionStorage.removeItem("user");
};

const clearAuthSession = () => {
  localStorage.removeItem("token");
  localStorage.removeItem("user");
  sessionStorage.removeItem("token");
  sessionStorage.removeItem("user");
};

const getAuthHeaders = (headers = {}, token = getStoredToken()) => {
  if (!token) return headers;
  return {
    ...headers,
    Authorization: `Bearer ${token}`,
  };
};

const getDisplayName = (user) => {
  return user?.name?.trim() || "Runner";
};


function App() {
  const [activePage, setActivePage] = useState(() =>
    getStoredToken() ? "dashboard" : "login"
  );
  const [authUser, setAuthUser] = useState(() => getStoredUser());
  const [authForm, setAuthForm] = useState({
    name: "",
    email: "",
    password: "",
    confirmPassword: "",
  });
  const [authMessage, setAuthMessage] = useState("");
  const [authLoading, setAuthLoading] = useState(false);

  const [form, setForm] = useState({
    title: "",
    distance: "",
    pace: "",
    plan_start_date: "",
  });

  const pageTitles = {
    login: "Log In | Rundle",
    signup: "Sign Up | Rundle",
    dashboard: "Dashboard | Rundle",
    generate: "Generate Schedule | Rundle",
    schedules: "My Schedules | Rundle",
    detail: "Schedule Detail | Rundle",
    profile: "Runner Profile | Rundle",
  };

  useEffect(() => {
    document.title = pageTitles[activePage] || "Rundle";
  }, [activePage]);

  const [generatedPlan, setGeneratedPlan] = useState(null);
  const [savedSchedules, setSavedSchedules] = useState([]);
  const [selectedSchedule, setSelectedSchedule] = useState(null);
  const [selectedDashboardDay, setSelectedDashboardDay] = useState("Monday");
  const [editingDay, setEditingDay] = useState(null);

  const [editForm, setEditForm] = useState({
    workout_type: "",
    target_distance_km: "",
    target_pace: "",
    notes: "",
  });

  const [messages, setMessages] = useState({
    generated: "",
    saved: "",
    schedules: "",
    detail: "",
  });

  const [loading, setLoading] = useState(false);

  const latestSchedule = savedSchedules.length > 0 ? savedSchedules[0] : null;

  const currentProfile =
    generatedPlan?.model_prediction ||
    selectedSchedule?.model_prediction ||
    latestSchedule?.model_prediction ||
    null;

  const setPageMessage = (page, text) => {
    setMessages((prev) => ({
      ...prev,
      [page]: text,
    }));
  };

  const clearPageMessage = (page) => {
    setMessages((prev) => ({
      ...prev,
      [page]: "",
    }));
  };

  const getErrorMessage = (detail, fallback) => {
    if (!detail) return fallback;

    if (typeof detail === "string") {
      return detail;
    }

    if (Array.isArray(detail)) {
      return detail
        .map((err) => {
          if (typeof err === "string") return err;
          if (err?.msg) return err.msg;
          if (err?.message) return err.message;
          return JSON.stringify(err);
        })
        .join(", ");
    }

    if (typeof detail === "object") {
      if (detail.message) return detail.message;
      if (detail.msg) return detail.msg;
      return JSON.stringify(detail);
    }

    return fallback;
  };

  const parseJsonResponse = async (response) => {
    const text = await response.text();

    if (!text) {
      return {};
    }

    try {
      return JSON.parse(text);
    } catch {
      return {};
    }
  };

  const validateScheduleForm = () => {
    if (!form.title.trim()) {
      return "Please fill in the plan title first.";
    }

    if (!form.distance) {
      return "Please fill in weekly distance first.";
    }

    if (Number(form.distance) <= 0) {
      return "Weekly distance must be greater than 0.";
    }

    if (!form.pace.trim()) {
      return "Please fill in average pace first.";
    }

    return "";
  };

  const handleAuthChange = (e) => {
    setAuthForm({
      ...authForm,
      [e.target.name]: e.target.value,
    });
  };

  const resetPrivateData = () => {
    setGeneratedPlan(null);
    setSavedSchedules([]);
    setSelectedSchedule(null);
    setSelectedDashboardDay("Monday");
    setEditingDay(null);
  };

  const handleLogout = () => {
    clearAuthSession();
    setAuthUser(null);
    resetPrivateData();
    setAuthMessage("");
    setActivePage("login");
  };

  const handleSignin = async (e) => {
    e.preventDefault();

    if (!authForm.email.trim() || !authForm.password.trim()) {
      setAuthMessage("Please fill in your e-mail and password.");
      return;
    }

    setAuthLoading(true);
    setAuthMessage("");

    try {
      const response = await fetch(`${API_BASE_URL}/signin`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email: authForm.email,
          password: authForm.password,
        }),
      });

      const data = await parseJsonResponse(response);

      if (!response.ok) {
        throw new Error(getErrorMessage(data.detail, "Failed to sign in."));
      }

      saveAuthSession(data.access_token, data.user);
      setAuthUser(data.user);
      setAuthForm({ name: "", email: "", password: "", confirmPassword: "" });
      setActivePage("dashboard");
      await loadSchedules(data.access_token);
    } catch (error) {
      setAuthMessage(error.message);
    } finally {
      setAuthLoading(false);
    }
  };

  const handleSignup = async (e) => {
    e.preventDefault();

    if (
      !authForm.name.trim() ||
      !authForm.email.trim() ||
      !authForm.password.trim() ||
      !authForm.confirmPassword.trim()
    ) {
      setAuthMessage("Please fill in your full name, e-mail, password, and confirm password.");
      return;
    }

    if (authForm.password !== authForm.confirmPassword) {
      setAuthMessage("Password and confirm password do not match.");
      return;
    }

    setAuthLoading(true);
    setAuthMessage("");

    try {
      const response = await fetch(`${API_BASE_URL}/signup`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: authForm.name,
          email: authForm.email,
          password: authForm.password,
        }),
      });

      const data = await parseJsonResponse(response);

      if (!response.ok) {
        throw new Error(getErrorMessage(data.detail, "Failed to sign up."));
      }

      saveAuthSession(data.access_token, data.user);
      setAuthUser(data.user);
      setAuthForm({ name: "", email: "", password: "", confirmPassword: "" });
      setActivePage("dashboard");
      await loadSchedules(data.access_token);
    } catch (error) {
      setAuthMessage(error.message);
    } finally {
      setAuthLoading(false);
    }
  };

  const requireLogin = () => {
    setAuthMessage("Please log in first.");
    setActivePage("login");
  };

  const loadSchedules = async (authToken = getStoredToken()) => {
    if (!authToken) {
      setSavedSchedules([]);
      return;
    }

    try {
      const response = await fetch(`${API_BASE_URL}/schedules`, {
        headers: getAuthHeaders({}, authToken),
      });
      const data = await parseJsonResponse(response);

      if (response.status === 401) {
        handleLogout();
        return;
      }

      if (!response.ok) {
        throw new Error(getErrorMessage(data.detail, "Failed to load schedules."));
      }

      setSavedSchedules(data.data || []);
    } catch (error) {
      setPageMessage("schedules", error.message);
    }
  };

  useEffect(() => {
    const token = getStoredToken();
    if (token) loadSchedules(token);
  }, []);

  const buildPayload = () => {
    const payload = {
      title: form.title,
      distance: Number(form.distance),
      pace: form.pace,
    };

    if (form.plan_start_date) {
      payload.plan_start_date = form.plan_start_date;
    }

    return payload;
  };

  const handleChange = (e) => {
    setForm({
      ...form,
      [e.target.name]: e.target.value,
    });
  };

  const generatePlan = async (e) => {
    e.preventDefault();

    const validationMessage = validateScheduleForm();

    if (validationMessage) {
      setPageMessage("generated", validationMessage);
      return;
    }

    setLoading(true);
    clearPageMessage("generated");
    clearPageMessage("saved");

    try {
      const response = await fetch(`${API_BASE_URL}/weekly-plan`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(buildPayload()),
      });

      const data = await parseJsonResponse(response);

      if (!response.ok) {
        throw new Error(
          getErrorMessage(data.detail, "Failed to generate schedule.")
        );
      }

      setGeneratedPlan(data);
      setPageMessage("generated", "Running schedule generated successfully!");
    } catch (error) {
      setPageMessage("generated", error.message);
    } finally {
      setLoading(false);
    }
  };

  const savePlan = async () => {
    const validationMessage = validateScheduleForm();

    if (validationMessage) {
      setPageMessage("saved", validationMessage);
      return;
    }

    if (!generatedPlan) {
      setPageMessage("saved", "Please generate a schedule first before saving.");
      return;
    }

    const token = getStoredToken();

    if (!token) {
      requireLogin();
      return;
    }

    setLoading(true);
    clearPageMessage("saved");

    try {
      const response = await fetch(`${API_BASE_URL}/weekly-plan/save`, {
        method: "POST",
        headers: getAuthHeaders({
          "Content-Type": "application/json",
        }, token),
        body: JSON.stringify(buildPayload()),
      });

      const data = await parseJsonResponse(response);

      if (!response.ok) {
        throw new Error(getErrorMessage(data.detail, "Failed to save schedule."));
      }

      setPageMessage("saved", "Running schedule has been saved successfully!");
      setSelectedSchedule(data.data);
      await loadSchedules();
    } catch (error) {
      setPageMessage("saved", error.message);
    } finally {
      setLoading(false);
    }
  };

  const openScheduleDetail = async (scheduleId) => {
    setLoading(true);
    clearPageMessage("schedules");
    clearPageMessage("detail");

    const token = getStoredToken();

    if (!token) {
      requireLogin();
      setLoading(false);
      return;
    }

    try {
      const response = await fetch(`${API_BASE_URL}/schedules/${scheduleId}`, {
        headers: getAuthHeaders({}, token),
      });
      const data = await parseJsonResponse(response);

      if (!response.ok) {
        throw new Error(getErrorMessage(data.detail, "Schedule not found."));
      }

      setSelectedSchedule(data);
      setActivePage("detail");
    } catch (error) {
      setPageMessage("schedules", error.message);
    } finally {
      setLoading(false);
    }
  };

  const deleteSchedule = async (scheduleId, sourcePage = "schedules") => {
    const confirmDelete = confirm("Are you sure you want to delete this schedule?");
    if (!confirmDelete) return;

    const token = getStoredToken();

    if (!token) {
      requireLogin();
      return;
    }

    setLoading(true);
    clearPageMessage("schedules");
    clearPageMessage("detail");

    try {
      const response = await fetch(`${API_BASE_URL}/schedules/${scheduleId}`, {
        method: "DELETE",
        headers: getAuthHeaders({}, token),
      });

      const data = await parseJsonResponse(response);

      if (!response.ok) {
        throw new Error(getErrorMessage(data.detail, "Failed to delete schedule."));
      }

      setSelectedSchedule(null);
      await loadSchedules();
      setActivePage("schedules");
      setPageMessage("schedules", "Running schedule has been deleted successfully!");
    } catch (error) {
      setPageMessage(sourcePage, error.message);
    } finally {
      setLoading(false);
    }
  };

  const startEditDay = (item) => {
    setEditingDay(item.day);
    clearPageMessage("detail");

    setEditForm({
      workout_type: item.workout_type,
      target_distance_km: item.target_distance_km,
      target_pace: item.target_pace,
      notes: item.notes,
    });
  };

  const updateDaySchedule = async () => {
    if (!selectedSchedule || !editingDay) return;

    if (!editForm.workout_type.trim()) {
      setPageMessage("detail", "Please fill in workout type first.");
      return;
    }

    if (!editForm.target_distance_km || Number(editForm.target_distance_km) < 0) {
      setPageMessage("detail", "Please fill in a valid target distance.");
      return;
    }

    if (!editForm.target_pace.trim()) {
      setPageMessage("detail", "Please fill in target pace first.");
      return;
    }

    const token = getStoredToken();

    if (!token) {
      requireLogin();
      return;
    }

    setLoading(true);
    clearPageMessage("detail");

    try {
      const response = await fetch(
        `${API_BASE_URL}/schedules/${selectedSchedule.id}/day/${editingDay}`,
        {
          method: "PATCH",
          headers: getAuthHeaders({
            "Content-Type": "application/json",
          }, token),
          body: JSON.stringify({
            workout_type: editForm.workout_type,
            target_distance_km: Number(editForm.target_distance_km),
            target_pace: editForm.target_pace,
            notes: editForm.notes,
          }),
        }
      );

      const data = await parseJsonResponse(response);

      if (!response.ok) {
        throw new Error(getErrorMessage(data.detail, "Failed to update schedule."));
      }

      setSelectedSchedule(data.data);
      setEditingDay(null);
      setPageMessage("detail", "Running schedule has been updated successfully!");
      await loadSchedules();
    } catch (error) {
      setPageMessage("detail", error.message);
    } finally {
      setLoading(false);
    }
  };

  if (activePage === "login" || activePage === "signup") {
    return (
      <AuthPage
        mode={activePage}
        form={authForm}
        onChange={handleAuthChange}
        onSignin={handleSignin}
        onSignup={handleSignup}
        setActivePage={setActivePage}
        message={authMessage}
        loading={authLoading}
      />
    );
  }

  return (
    <div className="app">
      <Sidebar
        activePage={activePage}
        setActivePage={setActivePage}
        loadSchedules={loadSchedules}
        authUser={authUser}
        onLogout={handleLogout}
      />

      <main className="main">
        {activePage === "dashboard" && (
          <Dashboard
            authUser={authUser}
            latestSchedule={latestSchedule}
            savedSchedules={savedSchedules}
            currentProfile={currentProfile}
            selectedDashboardDay={selectedDashboardDay}
            setSelectedDashboardDay={setSelectedDashboardDay}
            setActivePage={setActivePage}
          />
        )}

        {activePage === "generate" && (
          <GenerateSchedule
            form={form}
            handleChange={handleChange}
            generatePlan={generatePlan}
            savePlan={savePlan}
            generatedPlan={generatedPlan}
            messageGenerated={messages.generated}
            messageSaved={messages.saved}
            loading={loading}
          />
        )}

        {activePage === "schedules" && (
          <MySchedules
            schedules={savedSchedules}
            openScheduleDetail={openScheduleDetail}
            deleteSchedule={deleteSchedule}
            setActivePage={setActivePage}
            message={messages.schedules}
          />
        )}

        {activePage === "detail" && selectedSchedule && (
          <ScheduleDetail
            schedule={selectedSchedule}
            editingDay={editingDay}
            editForm={editForm}
            setEditForm={setEditForm}
            startEditDay={startEditDay}
            updateDaySchedule={updateDaySchedule}
            cancelEdit={() => {
              setEditingDay(null);
              clearPageMessage("detail");
            }}
            deleteSchedule={deleteSchedule}
            message={messages.detail}
            loading={loading}
          />
        )}

        {activePage === "profile" && (
          <RunnerProfile
            profile={currentProfile}
            authUser={authUser}
            onLogout={handleLogout}
          />
        )}
        <MainFooter />
      </main>
    </div>
  );
}


function AuthPage({
  mode,
  form,
  onChange,
  onSignin,
  onSignup,
  setActivePage,
  message,
  loading,
}) {
  const isLogin = mode === "login";

  return (
    <div className="auth-page">
      <video className="auth-page-motion-bg" autoPlay muted loop playsInline>
        <source src="/motion_graphic.mp4" type="video/mp4" />
      </video>
      <div className="auth-page-overlay" />

      <section className="auth-visual">
        <div className="auth-logo">
          <img src="/logo.png" alt="rundle logo" />
        </div>

        <div className="auth-graphic-wrap">
          <img src="/graphics.png" alt="running schedule preview" />
        </div>

        <div className="auth-copy">
          <h2>Input, Generate, Save!</h2>
          <p>
            Generate a personalized running schedule that helps you build an
            effective training & consistency!
          </p>
        </div>

        <AuthFooter />
      </section>

      <main className="auth-content">
        <section className={isLogin ? "auth-card" : "auth-card signup-card"}>
          <div className="auth-heading">
            <h1>{isLogin ? "Welcome Back!" : "Welcome to Rundle!"}</h1>
            <p>
              {isLogin
                ? "Log in to start creating the perfect running schedule."
                : "Create an account to start creating the perfect running schedule."}
            </p>
          </div>

          <form className="auth-form" onSubmit={isLogin ? onSignin : onSignup}>
            {!isLogin && (
              <label>
                Full Name
                <input
                  type="text"
                  name="name"
                  value={form.name}
                  onChange={onChange}
                  placeholder="John Doe"
                  autoComplete="name"
                />
              </label>
            )}

            <label>
              E-mail
              <input
                type="email"
                name="email"
                value={form.email}
                onChange={onChange}
                placeholder="johndoe@gmail.com"
                autoComplete="email"
              />
            </label>

            <label>
              Password
              <input
                type="password"
                name="password"
                value={form.password}
                onChange={onChange}
                placeholder="Enter your password..."
                autoComplete={isLogin ? "current-password" : "new-password"}
              />
            </label>

            {!isLogin && (
              <label>
                Confirm Password
                <input
                  type="password"
                  name="confirmPassword"
                  value={form.confirmPassword}
                  onChange={onChange}
                  placeholder="Confirm your password..."
                  autoComplete="new-password"
                />
              </label>
            )}

            {message && <div className="auth-message">{message}</div>}

            <button className="auth-submit-btn" type="submit" disabled={loading}>
              {loading ? "Please wait..." : isLogin ? "Sign In" : "Sign Up"}
            </button>
          </form>

          <p className="auth-switch-text">
            {isLogin ? "Don’t have an account? " : "Already have an account? "}
            <button
              type="button"
              onClick={() => {
                setActivePage(isLogin ? "signup" : "login");
              }}
            >
              {isLogin ? "Sign Up" : "Log In"}
            </button>
          </p>
        </section>
        <AuthFooter className="auth-mobile-footer" />
      </main>
    </div>
  );
}

function AuthFooter({ className = "" }) {
  return (
    <div className={`auth-footer ${className}`}>
      <div className="auth-socials">
        <a href="#" aria-label="TikTok"><TiktokIcon /></a>
        <a href="#" aria-label="Instagram"><InstagramIcon /></a>
        <a href="#" aria-label="Facebook"><FacebookIcon /></a>
        <a href="#" aria-label="X"><XIcon /></a>
      </div>
      <p>© 2026 rundle. | All rights reserved.</p>
    </div>
  );
}

function Sidebar({ activePage, setActivePage, loadSchedules, authUser, onLogout }) {
  const [mobileOpen, setMobileOpen] = useState(false);

  const menu = [
    { id: "dashboard", label: "Dashboard", icon: <DashboardIcon /> },
    { id: "generate", label: "Generate Schedule", icon: <GenerateIcon /> },
    { id: "schedules", label: "My Schedules", icon: <ScheduleIcon /> },
    { id: "profile", label: "Runner Profile", icon: <ProfileIcon /> },
  ];

  const handleMenuClick = (itemId) => {
    setActivePage(itemId);
    if (itemId === "schedules") loadSchedules();
    setMobileOpen(false);
  };

  return (
    <aside className={mobileOpen ? "sidebar mobile-open" : "sidebar"}>
      <div className="sidebar-top">
        <div className="sidebar-header">
          <div className="logo-box">
            <img src="/logo.png" alt="rundle logo" />
          </div>

          <button
            className="mobile-menu-btn"
            type="button"
            onClick={() => setMobileOpen(!mobileOpen)}
            aria-label="Toggle navigation menu"
            aria-expanded={mobileOpen}
          >
            {mobileOpen ? <CloseIcon /> : <MenuIcon />}
          </button>
        </div>

        <nav className="sidebar-menu">
          {menu.map((item) => (
            <button
              key={item.id}
              className={activePage === item.id ? "sidebar-item active" : "sidebar-item"}
              onClick={() => handleMenuClick(item.id)}
            >
              <span className="sidebar-icon">{item.icon}</span>
              <span>{item.label}</span>
            </button>
            
          ))}
          <button className="sidebar-item logout-item" type="button" onClick={onLogout}>
          <span className="sidebar-icon"><LogoutIcon /></span>
          <span>Log Out</span>
        </button>
        </nav>
      </div>

      <div className="sidebar-footer">
        {authUser && (
          <div className="sidebar-user">
            <span>Signed in as</span>
            <strong>{authUser.name}</strong>
          </div>
        )}
      </div>
    </aside>
  );
}

function MainFooter() {
  const socials = [
    { label: "TikTok", href: "#", icon: <TiktokIcon /> },
    { label: "Instagram", href: "#", icon: <InstagramIcon /> },
    { label: "Facebook", href: "#", icon: <FacebookIcon /> },
    { label: "X", href: "#", icon: <XIcon /> },
  ];

  return (
    <footer className="main-footer">
      <p className="main-footer-copyright">
        © {new Date().getFullYear()} rundle. All rights reserved.
      </p>

      <div className="main-footer-socials">
        {socials.map((item) => (
          <a
            key={item.label}
            href={item.href}
            className="social-icon"
            aria-label={item.label}
          >
            {item.icon}
          </a>
        ))}
      </div>
    </footer>
  );
}

function Dashboard({
  authUser,
  latestSchedule,
  savedSchedules,
  currentProfile,
  selectedDashboardDay,
  setSelectedDashboardDay,
  setActivePage,
}) {
  const schedule = latestSchedule?.weekly_plan?.schedule || [];
  const selectedDayData =
    schedule.find((item) => item.day === selectedDashboardDay) || schedule[0];
  const displayName = getDisplayName(authUser);

  return (
    <section className="page dashboard-page">
      <h1>Welcome, {displayName}!</h1>
      <p className="subtitle">Explore and create your perfect running schedules.</p>

      <div className="dashboard-top-grid">
        <div className="gradient-stat-card">
          <div>
            <p>Current Level</p>
            <h2>{shortLevel(currentProfile?.runner_level) || "No Data"}</h2>
          </div>
          <div className="round-icon">
            <RunnerIcon />
          </div>
        </div>

        <div className="white-stat-card">
          <div>
            <p>Total Saved Schedules</p>
            <h2>
              {savedSchedules.length === 0 ? "0" : savedSchedules.length}
              <span> schedule(s)</span>
            </h2>
          </div>
          <CalendarIcon />
        </div>
      </div>

      <div className="weekly-dashboard-card">
        <h2>This week’s schedule — {latestSchedule?.title || "No Title"}</h2>

        <div className="weekly-inner-card">
          {!latestSchedule ? (
            <EmptyBox
              text="No saved schedule yet."
              subText="Start creating your schedule!"
              buttonText="Generate Schedule"
              onClick={() => setActivePage("generate")}
            />
          ) : (
            <>
              <div className="day-tabs">
                {schedule.map((item) => (
                  <button
                    key={item.day}
                    className={selectedDashboardDay === item.day ? "active" : ""}
                    onClick={() => setSelectedDashboardDay(item.day)}
                  >
                    {item.day}
                  </button>
                ))}
              </div>

              {selectedDayData && (
                <div className="dashboard-day-content">
                  <div>
                    <h3>
                      {selectedDayData.workout_type}{" "}
                      <span>— {selectedDayData.date}</span>
                    </h3>
                    <p>
                      Target Pace:{" "}
                      <strong>{formatPace(selectedDayData.target_pace)}</strong>
                    </p>
                    <p>
                      Target Distance:{" "}
                      <strong>{selectedDayData.target_distance_km} km</strong>
                    </p>
                  </div>

                  <div className="notes-box">
                    <strong>Notes:</strong>
                    <p>{selectedDayData.notes}</p>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      <div className="dashboard-bottom-grid">
        <div className="white-stat-card big">
          <div>
            <p>Recommended Days</p>
            <h2>{currentProfile?.recommended_training_days || 0} Days</h2>
          </div>
          <CalendarSolidIcon />
        </div>

        <div className="white-stat-card big">
          <div>
            <p>Total Distance</p>
            <h2>{latestSchedule?.weekly_plan?.total_weekly_distance_km || 0} km</h2>
          </div>
          <PinIcon />
        </div>
      </div>
    </section>
  );
}

function GenerateSchedule({
  form,
  handleChange,
  generatePlan,
  savePlan,
  generatedPlan,
  messageGenerated,
  messageSaved,
  loading,
}) {
  return (
    <section className="page">
      <h1>Generate Running Schedule</h1>
      <p className="subtitle">
        Input your running distance and pace to generate a weekly plan.
      </p>

      <form className="form-panel" onSubmit={generatePlan}>
        <div className="form-grid">
          <label>
            Plan Title
            <input
              name="title"
              value={form.title}
              onChange={handleChange}
              placeholder="My Running Plan"
            />
          </label>

          <label>
            Weekly Distance (km)
            <input
              type="number"
              name="distance"
              value={form.distance}
              onChange={handleChange}
              placeholder="0"
              min="1"
              step="0.1"
            />
          </label>

          <label>
            Average Pace
            <input
              name="pace"
              value={form.pace}
              onChange={handleChange}
              placeholder="0:00"
            />
          </label>

          <label>
            Reference Date (optional)
            <input
              type="date"
              name="plan_start_date"
              value={form.plan_start_date}
              onChange={handleChange}
            />
          </label>
        </div>

        <div className="center">
          <button className="primary-btn" disabled={loading}>
            {loading ? "Generating..." : "Generate Schedule"}
          </button>
        </div>

        {messageGenerated && (<div className="message-box">{messageGenerated}</div>)}
      </form>

      {generatedPlan && (
        <div className="generated-section">
          <div className="section-title-row">
            <div>
              <h2>Weekly Schedule</h2>
              <p>
                {generatedPlan.weekly_plan.week_start_date} -{" "}
                {generatedPlan.weekly_plan.week_end_date}
              </p>
            </div>

            <button
              className="primary-btn save-btn"
              onClick={savePlan}
              disabled={loading}
            >
              {loading ? "Saving..." : "Save Schedule"}
            </button>
          </div>
          {messageSaved && (<div className="message-box">{messageSaved}</div>)}
          <ProfileSummary profile={generatedPlan.model_prediction} />
          <ScheduleCards schedule={generatedPlan.weekly_plan.schedule} />
        </div>
      )}
    </section>
  );
}

function MySchedules({
  schedules,
  openScheduleDetail,
  deleteSchedule,
  setActivePage,
  message,
}) {
  return (
    <section className="page">
      <h1>My Schedules</h1>
      <p className="subtitle">View, modify or delete your saved running schedules.</p>

      {message && <div className="message-box">{message}</div>}

      {schedules.length === 0 ? (
        <div className="empty-large-card">
          <EmptyBox
            text="No saved schedule yet."
            subText="Start creating your schedule!"
            buttonText="Generate Schedule"
            onClick={() => setActivePage("generate")}
          />
        </div>
      ) : (
        <div className="schedule-list">
          {schedules.map((item) => (
            <div className="saved-schedule-card" key={item.id}>
              <div>
                <h2>{item.title}</h2>
                <p>
                  {slashDate(item.weekly_plan.week_start_date)} -{" "}
                  {slashDate(item.weekly_plan.week_end_date)}
                </p>
                <strong>{item.model_prediction.runner_level}</strong>
              </div>

              <div className="saved-actions">
                <button
                  className="primary-btn"
                  onClick={() => openScheduleDetail(item.id)}
                >
                  View
                </button>
                <button
                  className="soft-btn"
                  onClick={() => deleteSchedule(item.id, "schedules")}
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function ScheduleDetail({
  schedule,
  editingDay,
  editForm,
  setEditForm,
  startEditDay,
  updateDaySchedule,
  cancelEdit,
  deleteSchedule,
  message,
  loading,
}) {
  return (
    <section className="page">
      <div className="detail-header">
        <div>
          <h1>{schedule.title}</h1>
          <p>
            {slashDate(schedule.weekly_plan.week_start_date)} -{" "}
            {slashDate(schedule.weekly_plan.week_end_date)}
          </p>
        </div>

        <button
          className="primary-btn"
          onClick={() => deleteSchedule(schedule.id, "detail")}
          disabled={loading}
        >
          Delete Schedule
        </button>
      </div>

      <ProfileSummary profile={schedule.model_prediction} />

      {message && <div className="message-box">{message}</div>}

      <div className="schedule-grid">
        {schedule.weekly_plan.schedule.map((item) => (
          <div className="run-card" key={item.day}>
            <div className="run-card-header">
              <div>
                <h2>{item.day}</h2>
                <p>{item.date}</p>
              </div>
              <span>{item.workout_type}</span>
            </div>

            {editingDay === item.day ? (
              <div className="edit-form">
                <label>
                  Workout Type
                  <input
                    value={editForm.workout_type}
                    onChange={(e) =>
                      setEditForm({ ...editForm, workout_type: e.target.value })
                    }
                  />
                </label>

                <label>
                  Target Distance (km)
                  <input
                    type="number"
                    value={editForm.target_distance_km}
                    onChange={(e) =>
                      setEditForm({
                        ...editForm,
                        target_distance_km: e.target.value,
                      })
                    }
                  />
                </label>

                <label>
                  Target Pace
                  <input
                    value={editForm.target_pace}
                    onChange={(e) =>
                      setEditForm({ ...editForm, target_pace: e.target.value })
                    }
                  />
                </label>

                <label>
                  Notes
                  <textarea
                    value={editForm.notes}
                    onChange={(e) =>
                      setEditForm({ ...editForm, notes: e.target.value })
                    }
                  />
                </label>

                <div className="edit-actions">
                  <button
                    className="primary-btn"
                    onClick={updateDaySchedule}
                    disabled={loading}
                  >
                    {loading ? "Saving..." : "Save"}
                  </button>
                  <button className="soft-btn" onClick={cancelEdit}>
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <>
                <div className="metric-grid">
                  <div className="metric-box">
                    <span>Target Distance</span>
                    <strong>{item.target_distance_km} km</strong>
                  </div>

                  <div className="metric-box">
                    <span>Target Pace</span>
                    <strong>{formatPace(item.target_pace)}</strong>
                  </div>
                </div>

                <p className="run-notes">{item.notes}</p>

                <button
                  className="soft-btn edit-btn"
                  onClick={() => startEditDay(item)}
                >
                  Edit
                </button>
              </>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

function RunnerProfile({ profile, authUser, onLogout }) {
  const notes = getProfileNotes(profile);
  const displayName = getDisplayName(authUser);

  return (
    <section className="page">
      <div className="profile-page-header">
        <div>
          <h1>{displayName}’s Profile</h1>
          <p className="subtitle">
            AI-based runner insight from your latest generated or saved plan.
          </p>
        </div>

        <button className="primary-btn profile-logout-btn" onClick={onLogout}>
          Log Out
        </button>
      </div>

      {!profile ? (
        <div className="empty-large-card">
          <EmptyBox
            text="No runner profile yet."
            subText="Generate a schedule first to see your profile."
          />
        </div>
      ) : (
        <>
          <ProfileSummary profile={profile} />

          <div className="profile-grid">
            <InfoGradientCard title="Profile Notes" text={notes.profile_notes} />
            <InfoGradientCard title="Strength" text={notes.strength} />
            <InfoGradientCard title="Warning" text={notes.risk} />

            <div className="info-gradient-card">
              <h2>Recommendations</h2>
              <ul>
                {notes.recommendation.map((item, index) => (
                  <li key={index}>{item}</li>
                ))}
              </ul>
            </div>
          </div>
        </>
      )}
    </section>
  );
}

function ProfileSummary({ profile }) {
  if (!profile) return null;

  return (
    <div className="profile-summary">
      <div>
        <span>Runner Level</span>
        <strong>{profile.runner_level}</strong>
      </div>

      <div>
        <span>Training Focus</span>
        <strong>{profile.training_focus}</strong>
      </div>

      <div>
        <span>Recommended Training Days</span>
        <strong>{profile.recommended_training_days} Days</strong>
      </div>
    </div>
  );
}

function ScheduleCards({ schedule }) {
  return (
    <div className="schedule-grid">
      {schedule.map((item) => (
        <div className="run-card" key={item.day}>
          <div className="run-card-header">
            <div>
              <h2>{item.day}</h2>
              <p>{item.date}</p>
            </div>
            <span>{item.workout_type}</span>
          </div>

          <div className="metric-grid">
            <div className="metric-box">
              <span>Target Distance</span>
              <strong>{item.target_distance_km} km</strong>
            </div>

            <div className="metric-box">
              <span>Target Pace</span>
              <strong>{formatPace(item.target_pace)}</strong>
            </div>
          </div>

          <p className="run-notes">{item.notes}</p>
        </div>
      ))}
    </div>
  );
}

function EmptyBox({ text, subText, buttonText, onClick }) {
  return (
    <div className="empty-box">
      <div className="empty-icon">×</div>
      <strong>{text}</strong>
      <p>{subText}</p>

      {buttonText && (
        <button className="primary-btn" onClick={onClick}>
          {buttonText}
        </button>
      )}
    </div>
  );
}

function InfoGradientCard({ title, text }) {
  return (
    <div className="info-gradient-card">
      <h2>{title}</h2>
      <p>{text}</p>
    </div>
  );
}

function getProfileNotes(profile) {
  const level = profile?.runner_level || "";

  if (level.includes("Beginner")) {
    return {
      profile_notes:
        "You are still building your running foundation. The main focus should be consistency, not speed.",
      strength:
        "Great for building an aerobic base and a weekly running habit.",
      risk:
        "Increasing distance or speed too quickly can raise the risk of fatigue and injury.",
      recommendation: [
        "Start with 3 training days per week.",
        "Prioritize easy runs and recovery.",
        "Increase your distance gradually from week to week.",
      ],
    };
  }

  if (level.includes("Intermediate")) {
    return {
      profile_notes:
        "You have a fairly strong pace and stable training distance. Your training can focus more on performance improvement.",
      strength:
        "Your pace is solid and you are ready for tempo or interval training.",
      risk:
        "Doing fast workouts too often can increase the risk of injury.",
      recommendation: [
        "Combine easy runs, tempo runs, intervals, and long runs.",
        "Use rest days after high-intensity workouts.",
        "Stay consistent without increasing volume too quickly.",
      ],
    };
  }

  if (level.includes("Advanced")) {
    return {
      profile_notes:
        "You are a high-volume runner. Your program can be more challenging with a mix of speed, tempo, and endurance training.",
      strength:
        "You have strong endurance capacity and are ready for performance-focused training.",
      risk:
        "High training volume requires enough recovery to avoid overtraining.",
      recommendation: [
        "Use 5 training days per week.",
        "Include intervals, tempo runs, recovery runs, and long runs.",
        "Make sure there is at least 1 rest day each week.",
      ],
    };
  }

  return {
    profile_notes:
      "You are running at a more relaxed pace. The best focus is comfort, consistency, and gradual improvement.",
    strength:
      "Suitable for light, sustainable training with minimal pressure.",
    risk:
      "Forcing a fast pace too often can make training feel too hard and reduce consistency.",
    recommendation: [
      "Focus on easy runs and recovery runs.",
      "Use a comfortable pace first.",
      "Increase distance little by little.",
    ],
  };
}

function shortLevel(level) {
  if (!level) return "";
  if (level.includes("Beginner")) return "Beginner";
  if (level.includes("Intermediate")) return "Intermediate";
  if (level.includes("Advanced")) return "Advanced";
  if (level.includes("Slow")) return "Recovery";
  return level;
}

function formatPace(pace) {
  if (!pace || pace === "-") return "- / km";
  return `${pace} / km`;
}

function slashDate(date) {
  if (!date) return "-";
  return date.replaceAll("-", "/");
}

function DashboardIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M5.25 3.75h4.5c.83 0 1.5.67 1.5 1.5v4.5c0 .83-.67 1.5-1.5 1.5h-4.5c-.83 0-1.5-.67-1.5-1.5v-4.5c0-.83.67-1.5 1.5-1.5Z" />
      <path d="M14.25 3.75h4.5c.83 0 1.5.67 1.5 1.5v4.5c0 .83-.67 1.5-1.5 1.5h-4.5c-.83 0-1.5-.67-1.5-1.5v-4.5c0-.83.67-1.5 1.5-1.5Z" />
      <path d="M5.25 12.75h4.5c.83 0 1.5.67 1.5 1.5v4.5c0 .83-.67 1.5-1.5 1.5h-4.5c-.83 0-1.5-.67-1.5-1.5v-4.5c0-.83.67-1.5 1.5-1.5Z" />
      <path d="M14.25 12.75h4.5c.83 0 1.5.67 1.5 1.5v4.5c0 .83-.67 1.5-1.5 1.5h-4.5c-.83 0-1.5-.67-1.5-1.5v-4.5c0-.83.67-1.5 1.5-1.5Z" />
    </svg>
  );
}

function GenerateIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M5 3.25A2.25 2.25 0 0 0 2.75 5.5v3A2.25 2.25 0 0 0 5 10.75h3A2.25 2.25 0 0 0 10.25 8.5v-3A2.25 2.25 0 0 0 8 3.25H5Zm0 10A2.25 2.25 0 0 0 2.75 15.5v3A2.25 2.25 0 0 0 5 20.75h3a2.25 2.25 0 0 0 2.25-2.25v-3A2.25 2.25 0 0 0 8 13.25H5Zm10.5 0a2.25 2.25 0 0 0-2.25 2.25v3a2.25 2.25 0 0 0 2.25 2.25h3a2.25 2.25 0 0 0 2.25-2.25v-3a2.25 2.25 0 0 0-2.25-2.25h-3ZM16.43 2.89a.85.85 0 0 1 1.64 0l.57 2.04c.08.28.3.5.58.58l2.04.57a.85.85 0 0 1 0 1.64l-2.04.57a.86.86 0 0 0-.58.58l-.57 2.04a.85.85 0 0 1-1.64 0l-.57-2.04a.86.86 0 0 0-.58-.58l-2.04-.57a.85.85 0 0 1 0-1.64l2.04-.57a.86.86 0 0 0 .58-.58l.57-2.04Z" />
    </svg>
  );
}

function ScheduleIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M7 2.5a1 1 0 0 1 1 1V5h8V3.5a1 1 0 1 1 2 0V5h.75A2.25 2.25 0 0 1 21 7.25v11.5A2.25 2.25 0 0 1 18.75 21H5.25A2.25 2.25 0 0 1 3 18.75V7.25A2.25 2.25 0 0 1 5.25 5H6V3.5a1 1 0 0 1 1-1Zm12 7H5v9.25c0 .14.11.25.25.25h13.5c.14 0 .25-.11.25-.25V9.5Zm-11.25 2h1.5a.75.75 0 0 1 .75.75v1.5a.75.75 0 0 1-.75.75h-1.5a.75.75 0 0 1-.75-.75v-1.5a.75.75 0 0 1 .75-.75Zm4.5 0h1.5a.75.75 0 0 1 .75.75v1.5a.75.75 0 0 1-.75.75h-1.5a.75.75 0 0 1-.75-.75v-1.5a.75.75 0 0 1 .75-.75Zm4.5 0h1.5a.75.75 0 0 1 .75.75v1.5a.75.75 0 0 1-.75.75h-1.5a.75.75 0 0 1-.75-.75v-1.5a.75.75 0 0 1 .75-.75ZM7.75 16h1.5a.75.75 0 0 1 .75.75v1.5a.75.75 0 0 1-.75.75h-1.5a.75.75 0 0 1-.75-.75v-1.5a.75.75 0 0 1 .75-.75Zm4.5 0h1.5a.75.75 0 0 1 .75.75v1.5a.75.75 0 0 1-.75.75h-1.5a.75.75 0 0 1-.75-.75v-1.5a.75.75 0 0 1 .75-.75Z" />
    </svg>
  );
}

function ProfileIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 12.25A4.75 4.75 0 1 0 12 2.75a4.75 4.75 0 0 0 0 9.5Zm0 2c-4.95 0-8.75 2.5-8.75 5.35 0 .91.74 1.65 1.65 1.65h14.2c.91 0 1.65-.74 1.65-1.65 0-2.85-3.8-5.35-8.75-5.35Z" />
    </svg>
  );
}

function RunnerIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M3.3 13.7c.5-.95 1.48-1.55 2.55-1.55h3.5c.43 0 .84-.15 1.17-.43l3.7-3.1c.8-.67 2-.54 2.63.3l1.18 1.56c.3.4.74.68 1.23.78l1.53.32c.7.15 1.21.77 1.21 1.48v.76c0 .66-.54 1.2-1.2 1.2H3.74c-.45 0-.73-.48-.52-.87l.08-.45Z" />
      <path d="M2.2 16.2h19.6c.38 0 .7.31.7.7v.25a2.35 2.35 0 0 1-2.35 2.35H5.45a3.8 3.8 0 0 1-3.43-2.16l-.18-.38c-.17-.35.09-.76.47-.76Z" />
      <path d="M7.4 10.1a.75.75 0 0 1 1.06 0l1.18 1.18a.75.75 0 0 1-1.06 1.06L7.4 11.16a.75.75 0 0 1 0-1.06Z" />
      <path d="M10.6 9a.75.75 0 0 1 1.06 0l1.18 1.18a.75.75 0 0 1-1.06 1.06L10.6 10.06A.75.75 0 0 1 10.6 9Z" />
      <path d="M2 11.5c0-.41.34-.75.75-.75h2.5a.75.75 0 0 1 0 1.5h-2.5A.75.75 0 0 1 2 11.5Z" />
    </svg>
  );
}

function CalendarIcon() {
  return (
    <svg className="big-icon" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M7 2.25a1 1 0 0 1 1 1V4.5h8V3.25a1 1 0 1 1 2 0V4.5h.75A2.25 2.25 0 0 1 21 6.75v12A2.25 2.25 0 0 1 18.75 21H5.25A2.25 2.25 0 0 1 3 18.75v-12A2.25 2.25 0 0 1 5.25 4.5H6V3.25a1 1 0 0 1 1-1ZM5 9v9.75c0 .14.11.25.25.25h13.5c.14 0 .25-.11.25-.25V9H5Zm3.25 2.25h1.5a.75.75 0 0 1 .75.75v1.5a.75.75 0 0 1-.75.75h-1.5a.75.75 0 0 1-.75-.75V12a.75.75 0 0 1 .75-.75Zm4 0h1.5a.75.75 0 0 1 .75.75v1.5a.75.75 0 0 1-.75.75h-1.5a.75.75 0 0 1-.75-.75V12a.75.75 0 0 1 .75-.75Zm4 0h1.5a.75.75 0 0 1 .75.75v1.5a.75.75 0 0 1-.75.75h-1.5a.75.75 0 0 1-.75-.75V12a.75.75 0 0 1 .75-.75Zm-8 4h1.5a.75.75 0 0 1 .75.75v1.5a.75.75 0 0 1-.75.75h-1.5a.75.75 0 0 1-.75-.75V16a.75.75 0 0 1 .75-.75Zm4 0h1.5a.75.75 0 0 1 .75.75v1.5a.75.75 0 0 1-.75.75h-1.5a.75.75 0 0 1-.75-.75V16a.75.75 0 0 1 .75-.75Z" />
    </svg>
  );
}

function CalendarSolidIcon() {
  return <CalendarIcon />;
}

function PinIcon() {
  return (
    <svg className="big-icon" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 2.25A7.25 7.25 0 0 0 4.75 9.5c0 5.65 6.16 11.52 6.42 11.77a1.2 1.2 0 0 0 1.66 0c.26-.25 6.42-6.12 6.42-11.77A7.25 7.25 0 0 0 12 2.25Zm0 10a2.75 2.75 0 1 1 0-5.5 2.75 2.75 0 0 1 0 5.5Z" />
    </svg>
  );
}

function TiktokIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M17.5 5.35c-.9-.6-1.52-1.55-1.72-2.6H12.9v12.05a2.55 2.55 0 1 1-1.8-2.44V9.4a5.45 5.45 0 1 0 4.74 5.4V8.67a7.12 7.12 0 0 0 4.16 1.34V7.12a4.48 4.48 0 0 1-2.5-1.77Z" />
    </svg>
  );
}

function InstagramIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M7.75 2.75h8.5a5 5 0 0 1 5 5v8.5a5 5 0 0 1-5 5h-8.5a5 5 0 0 1-5-5v-8.5a5 5 0 0 1 5-5Zm0 2A3 3 0 0 0 4.75 7.75v8.5a3 3 0 0 0 3 3h8.5a3 3 0 0 0 3-3v-8.5a3 3 0 0 0-3-3h-8.5ZM12 7.65A4.35 4.35 0 1 1 12 16.35 4.35 4.35 0 0 1 12 7.65Zm0 2A2.35 2.35 0 1 0 12 14.35 2.35 2.35 0 0 0 12 9.65Zm4.6-2.95a1.05 1.05 0 1 1 0 2.1 1.05 1.05 0 0 1 0-2.1Z" />
    </svg>
  );
}

function FacebookIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M21.25 12A9.25 9.25 0 1 0 10.55 21.14v-6.46H8.2V12h2.35V9.96c0-2.32 1.38-3.61 3.5-3.61 1.02 0 2.08.18 2.08.18v2.29h-1.17c-1.16 0-1.52.72-1.52 1.45V12h2.59l-.41 2.68h-2.18v6.46A9.25 9.25 0 0 0 21.25 12Z" />
    </svg>
  );
}

function XIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M14.47 10.16 21.08 2.5h-1.57l-5.73 6.64L9.2 2.5H3.92l6.93 10.05-6.93 8.03h1.57l6.05-7 4.84 7h5.28l-7.19-10.42Zm-2.14 2.48-.7-1-5.59-7.94h2.4l4.5 6.39.7 1 5.87 8.34h-2.4l-4.78-6.79Z" />
    </svg>
  );
}

function MenuIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4.5 6.25c0-.69.56-1.25 1.25-1.25h12.5a1.25 1.25 0 1 1 0 2.5H5.75c-.69 0-1.25-.56-1.25-1.25Z" />
      <path d="M4.5 12c0-.69.56-1.25 1.25-1.25h12.5a1.25 1.25 0 1 1 0 2.5H5.75c-.69 0-1.25-.56-1.25-1.25Z" />
      <path d="M4.5 17.75c0-.69.56-1.25 1.25-1.25h12.5a1.25 1.25 0 1 1 0 2.5H5.75c-.69 0-1.25-.56-1.25-1.25Z" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M6.23 4.82a1 1 0 0 1 1.41 0L12 9.17l4.36-4.35a1 1 0 1 1 1.41 1.41L13.41 10.6l4.36 4.36a1 1 0 0 1-1.41 1.41L12 12.01l-4.36 4.36a1 1 0 1 1-1.41-1.41l4.36-4.36-4.36-4.37a1 1 0 0 1 0-1.41Z" />
    </svg>
  );
}


function LogoutIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M5.75 3A2.75 2.75 0 0 0 3 5.75v12.5A2.75 2.75 0 0 0 5.75 21h6.5A2.75 2.75 0 0 0 15 18.25v-2.5a1 1 0 1 0-2 0v2.5c0 .41-.34.75-.75.75h-6.5a.75.75 0 0 1-.75-.75V5.75c0-.41.34-.75.75-.75h6.5c.41 0 .75.34.75.75v2.5a1 1 0 1 0 2 0v-2.5A2.75 2.75 0 0 0 12.25 3h-6.5Z" />
      <path d="M16.7 8.29a1 1 0 0 1 1.42 0l3 3a1 1 0 0 1 0 1.42l-3 3a1 1 0 0 1-1.42-1.42L18 13h-8a1 1 0 1 1 0-2h8l-1.3-1.29a1 1 0 0 1 0-1.42Z" />
    </svg>
  );
}

export default App;