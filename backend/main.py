from fastapi import FastAPI, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from pathlib import Path
from typing import Optional, List
from datetime import datetime, date as DateType, timedelta
from zoneinfo import ZoneInfo
import pandas as pd
import numpy as np
import joblib
import json

from sqlalchemy.orm import Session

from database import create_tables, get_db, RunningScheduleDB, UserDB
from fastapi.security import OAuth2PasswordBearer
from passlib.context import CryptContext
from jose import jwt, JWTError


app = FastAPI(
    title="AI Running Schedule API",
    description="Weekly running schedule recommendation backend based on KMeans clustering.",
    version="2.0.0"
)


app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


create_tables()

APP_TZ = ZoneInfo("Asia/Jakarta")
SECRET_KEY = "rundle_secret_key_ganti_nanti"
ALGORITHM = "HS256"

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/signin")


MODEL_PATH = Path("model/running_schedule_model.pkl")

if not MODEL_PATH.exists():
    raise FileNotFoundError(
        "Model not found. Make sure the model file exists at: "
        "backend/model/running_schedule_model.pkl"
    )

model = joblib.load(MODEL_PATH)


class RunnerInput(BaseModel):
    title: Optional[str] = Field("My Running Schedule", example="My 5K Training Plan")
    distance: float = Field(..., gt=0, example=20)
    pace_min_per_km: Optional[float] = Field(None, gt=0, example=7.5)
    pace: Optional[str] = Field(None, example="7:30")
    plan_start_date: Optional[DateType] = Field(None, example="2026-06-15")

class SignupRequest(BaseModel):
    name: str
    email: str
    password: str


class SigninRequest(BaseModel):
    email: str
    password: str

class ScheduleItem(BaseModel):
    day: str = Field(..., example="Monday")
    date: Optional[DateType] = Field(None, example="2026-06-15")
    workout_type: str = Field(..., example="Easy Run")
    target_distance_km: float = Field(..., ge=0, example=5)
    target_pace: str = Field(..., example="8:00")
    notes: str = Field("", example="Light run to build consistency.")


class UpdateScheduleRequest(BaseModel):
    title: Optional[str] = Field(None, example="Updated Running Plan")
    schedule: Optional[List[ScheduleItem]] = None


class UpdateDayRequest(BaseModel):
    workout_type: Optional[str] = Field(None, example="Tempo Run")
    target_distance_km: Optional[float] = Field(None, ge=0, example=6)
    target_pace: Optional[str] = Field(None, example="7:00")
    notes: Optional[str] = Field(None, example="Stable pace training.")


CLUSTER_PROFILE = {
    0: {
        "runner_level": "Intermediate Fast Runner",
        "training_focus": "Improve speed and endurance",
        "recommended_training_days": 4,
    },
    1: {
        "runner_level": "Beginner / Casual Runner",
        "training_focus": "Build running consistency and habits",
        "recommended_training_days": 3,
    },
    2: {
        "runner_level": "Advanced / High Mileage Runner",
        "training_focus": "Improve performance and training volume",
        "recommended_training_days": 5,
    },
    3: {
        "runner_level": "Slow / Recovery-Oriented Runner",
        "training_focus": "Gradual improvement with safe intensity",
        "recommended_training_days": 3,
    },
}


def pydantic_to_dict(obj, exclude_unset=False):
    if hasattr(obj, "model_dump"):
        return obj.model_dump(exclude_unset=exclude_unset)

    return obj.dict(exclude_unset=exclude_unset)


def json_safe_schedule(schedule):
    safe_schedule = []

    for item in schedule:
        new_item = item.copy()

        if isinstance(new_item.get("date"), DateType):
            new_item["date"] = new_item["date"].isoformat()

        safe_schedule.append(new_item)

    return safe_schedule


def pace_string_to_float(pace: str) -> float:
    try:
        minutes, seconds = pace.split(":")
        minutes = int(minutes)
        seconds = int(seconds)

        if seconds < 0 or seconds >= 60:
            raise ValueError

        return round(minutes + seconds / 60, 2)

    except Exception:
        raise HTTPException(
            status_code=400,
            detail="Invalid pace format. Use a format like '7:30'."
        )


def float_pace_to_string(pace: float) -> str:
    minutes = int(pace)
    seconds = int(round((pace - minutes) * 60))

    if seconds == 60:
        minutes += 1
        seconds = 0

    return f"{minutes}:{seconds:02d}"


def get_pace_min_per_km(data: RunnerInput) -> float:
    if data.pace_min_per_km is not None:
        return data.pace_min_per_km

    if data.pace is not None:
        return pace_string_to_float(data.pace)

    raise HTTPException(
        status_code=400,
        detail="Enter either pace_min_per_km or pace."
    )


def clean_prediction(value):
    if isinstance(value, np.ndarray):
        return value.tolist()

    if isinstance(value, np.generic):
        return value.item()

    return value


def predict_cluster(distance: float, pace_min_per_km: float) -> int:
    input_df = pd.DataFrame([{
        "distance": distance,
        "pace_min_per_km": pace_min_per_km
    }])

    cluster = model.predict(input_df)[0]
    cluster = clean_prediction(cluster)

    return int(cluster)


def get_next_monday_from(reference_date: DateType) -> DateType:
    """
    Gets the Monday after reference_date.
    Monday = 0, Sunday = 6.
    If reference_date is Monday, it returns next week's Monday.
    """
    days_until_monday = 7 - reference_date.weekday()

    return reference_date + timedelta(days=days_until_monday)


def get_plan_week(plan_start_date: Optional[DateType] = None):
    """
    If plan_start_date is empty:
    - use today's date in the Asia/Jakarta timezone
    - get next week's Monday

    If plan_start_date is provided:
    - if the date is Monday, use that date
    - if the date is not Monday, get the Monday after that date
    """
    if plan_start_date is None:
        today = datetime.now(APP_TZ).date()
        start_date = get_next_monday_from(today)
    else:
        if plan_start_date.weekday() == 0:
            start_date = plan_start_date
        else:
            start_date = get_next_monday_from(plan_start_date)

    return {
        "week_start_date": start_date,
        "week_end_date": start_date + timedelta(days=6),
        "dates": {
            "Monday": start_date,
            "Tuesday": start_date + timedelta(days=1),
            "Wednesday": start_date + timedelta(days=2),
            "Thursday": start_date + timedelta(days=3),
            "Friday": start_date + timedelta(days=4),
            "Saturday": start_date + timedelta(days=5),
            "Sunday": start_date + timedelta(days=6),
        }
    }


def generate_schedule_by_cluster(
    cluster: int,
    distance: float,
    pace_min_per_km: float,
    plan_start_date: Optional[DateType] = None
):
    easy_pace = pace_min_per_km + 0.50
    recovery_pace = pace_min_per_km + 0.75
    long_pace = pace_min_per_km + 0.60
    tempo_pace = max(pace_min_per_km - 0.25, 3.5)
    interval_pace = max(pace_min_per_km - 0.50, 3.5)

    week_info = get_plan_week(plan_start_date)
    dates = week_info["dates"]

    if cluster == 1:
        raw_schedule = [
            ("Monday", "Easy Run", distance * 0.30, easy_pace, "Light run to build consistency."),
            ("Tuesday", "Rest", 0, None, "Rest for recovery."),
            ("Wednesday", "Easy Run", distance * 0.30, easy_pace, "Easy run at a comfortable pace."),
            ("Thursday", "Rest", 0, None, "Recovery day."),
            ("Friday", "Rest", 0, None, "Rest before the long run."),
            ("Saturday", "Long Run", distance * 0.40, long_pace, "Run farther at an easy pace."),
            ("Sunday", "Rest", 0, None, "Full rest."),
        ]

    elif cluster == 0:
        raw_schedule = [
            ("Monday", "Easy Run", distance * 0.20, easy_pace, "Easy run to start the week."),
            ("Tuesday", "Interval Run", distance * 0.20, interval_pace, "High-intensity speed training."),
            ("Wednesday", "Rest", 0, None, "Rest for recovery."),
            ("Thursday", "Tempo Run", distance * 0.25, tempo_pace, "Stable and slightly challenging pace training."),
            ("Friday", "Rest", 0, None, "Recovery before the long run."),
            ("Saturday", "Long Run", distance * 0.35, long_pace, "Long-distance run for endurance."),
            ("Sunday", "Rest", 0, None, "Full rest."),
        ]

    elif cluster == 2:
        raw_schedule = [
            ("Monday", "Easy Run", distance * 0.15, easy_pace, "Easy run for aerobic base."),
            ("Tuesday", "Interval Run", distance * 0.15, interval_pace, "Speed and VO2 max training."),
            ("Wednesday", "Recovery Run", distance * 0.10, recovery_pace, "Light run for active recovery."),
            ("Thursday", "Tempo Run", distance * 0.20, tempo_pace, "Threshold pace training."),
            ("Friday", "Rest", 0, None, "Rest to reduce injury risk."),
            ("Saturday", "Long Run", distance * 0.30, long_pace, "Main endurance training."),
            ("Sunday", "Easy Run", distance * 0.10, easy_pace, "Easy run to close the week."),
        ]

    elif cluster == 3:
        raw_schedule = [
            ("Monday", "Recovery Run", distance * 0.25, recovery_pace, "Very light and comfortable run."),
            ("Tuesday", "Rest", 0, None, "Rest."),
            ("Wednesday", "Easy Run", distance * 0.30, easy_pace, "Easy run without chasing speed."),
            ("Thursday", "Rest", 0, None, "Recovery day."),
            ("Friday", "Easy Run", distance * 0.20, easy_pace, "Short run to maintain consistency."),
            ("Saturday", "Long Run", distance * 0.25, long_pace, "Longer run at a safe pace."),
            ("Sunday", "Rest", 0, None, "Full rest."),
        ]

    else:
        raw_schedule = [
            ("Monday", "Easy Run", distance * 0.25, easy_pace, "Easy run."),
            ("Tuesday", "Rest", 0, None, "Rest."),
            ("Wednesday", "Tempo Run", distance * 0.25, tempo_pace, "Stable pace training."),
            ("Thursday", "Recovery Run", distance * 0.15, recovery_pace, "Active recovery."),
            ("Friday", "Rest", 0, None, "Rest."),
            ("Saturday", "Long Run", distance * 0.35, long_pace, "Long-distance run."),
            ("Sunday", "Rest", 0, None, "Full rest."),
        ]

    schedule = []

    for day, workout_type, target_distance, target_pace, notes in raw_schedule:
        schedule.append({
            "day": day,
            "date": dates[day].isoformat(),
            "workout_type": workout_type,
            "target_distance_km": round(target_distance, 2),
            "target_pace": "-" if target_pace is None else float_pace_to_string(target_pace),
            "notes": notes
        })

    return schedule


def calculate_total_distance(schedule):
    return round(sum(item["target_distance_km"] for item in schedule), 2)


def db_schedule_to_response(schedule_db: RunningScheduleDB):
    schedule = json.loads(schedule_db.schedule_json)

    return {
        "id": schedule_db.id,
        "title": schedule_db.title,
        "input": {
            "distance": schedule_db.distance,
            "pace_min_per_km": schedule_db.pace_min_per_km,
            "pace": schedule_db.pace
        },
        "model_prediction": {
            "cluster": schedule_db.cluster,
            "runner_level": schedule_db.runner_level,
            "training_focus": schedule_db.training_focus,
            "recommended_training_days": schedule_db.recommended_training_days
        },
        "weekly_plan": {
            "week_start_date": schedule_db.week_start_date.isoformat() if schedule_db.week_start_date else None,
            "week_end_date": schedule_db.week_end_date.isoformat() if schedule_db.week_end_date else None,
            "total_weekly_distance_km": schedule_db.total_weekly_distance_km,
            "schedule": schedule
        },
        "created_at": schedule_db.created_at,
        "updated_at": schedule_db.updated_at
    }

def hash_password(password: str):
    return pwd_context.hash(password)


def verify_password(password: str, password_hash: str):
    return pwd_context.verify(password, password_hash)


def create_access_token(data: dict):
    return jwt.encode(data, SECRET_KEY, algorithm=ALGORITHM)


def get_current_user(
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db)
):
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id = payload.get("user_id")

        if user_id is None:
            raise HTTPException(status_code=401, detail="Invalid token")

    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid token")

    user = db.query(UserDB).filter(UserDB.id == user_id).first()

    if not user:
        raise HTTPException(status_code=401, detail="User not found")

    return user

@app.get("/")
def home():
    return {
        "message": "AI Running Schedule API is running",
        "model_features": ["distance", "pace_min_per_km"]
    }


@app.get("/model-info")
def model_info():
    feature_names = getattr(model, "feature_names_in_", None)

    if feature_names is not None:
        feature_names = feature_names.tolist()

    return {
        "model_type": str(type(model)),
        "feature_names": feature_names,
        "cluster_profiles": CLUSTER_PROFILE
    }

@app.post("/signup")
def signup(data: SignupRequest, db: Session = Depends(get_db)):
    existing_user = db.query(UserDB).filter(UserDB.email == data.email).first()

    if existing_user:
        raise HTTPException(status_code=400, detail="Email already registered.")

    new_user = UserDB(
        name=data.name,
        email=data.email,
        password_hash=hash_password(data.password),
        created_at=datetime.utcnow()
    )

    db.add(new_user)
    db.commit()
    db.refresh(new_user)

    token = create_access_token({
        "user_id": new_user.id
    })

    return {
        "message": "Signup successful.",
        "access_token": token,
        "token_type": "bearer",
        "user": {
            "id": new_user.id,
            "name": new_user.name,
            "email": new_user.email
        }
    }


@app.post("/signin")
def signin(data: SigninRequest, db: Session = Depends(get_db)):
    user = db.query(UserDB).filter(UserDB.email == data.email).first()

    if not user:
        raise HTTPException(status_code=401, detail="Invalid email or password.")

    if not verify_password(data.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid email or password.")

    token = create_access_token({
        "user_id": user.id
    })

    return {
        "message": "Signin successful.",
        "access_token": token,
        "token_type": "bearer",
        "user": {
            "id": user.id,
            "name": user.name,
            "email": user.email
        }
    }


@app.post("/weekly-plan")
def weekly_plan(data: RunnerInput):
    pace_min_per_km = get_pace_min_per_km(data)

    cluster = predict_cluster(
        distance=data.distance,
        pace_min_per_km=pace_min_per_km
    )

    profile = CLUSTER_PROFILE.get(cluster, {
        "runner_level": "Unknown Runner Type",
        "training_focus": "General training",
        "recommended_training_days": 3
    })

    week_info = get_plan_week(data.plan_start_date)

    schedule = generate_schedule_by_cluster(
        cluster=cluster,
        distance=data.distance,
        pace_min_per_km=pace_min_per_km,
        plan_start_date=data.plan_start_date
    )

    total_weekly_distance = calculate_total_distance(schedule)

    return {
        "input": {
            "distance": data.distance,
            "pace_min_per_km": pace_min_per_km,
            "pace": float_pace_to_string(pace_min_per_km)
        },
        "model_prediction": {
            "cluster": cluster,
            "runner_level": profile["runner_level"],
            "training_focus": profile["training_focus"],
            "recommended_training_days": profile["recommended_training_days"]
        },
        "weekly_plan": {
            "week_start_date": week_info["week_start_date"].isoformat(),
            "week_end_date": week_info["week_end_date"].isoformat(),
            "total_weekly_distance_km": total_weekly_distance,
            "schedule": schedule
        }
    }


@app.post("/weekly-plan/save")
def generate_and_save_weekly_plan(
    data: RunnerInput,
    db: Session = Depends(get_db),
    current_user: UserDB = Depends(get_current_user)
):
    pace_min_per_km = get_pace_min_per_km(data)

    cluster = predict_cluster(
        distance=data.distance,
        pace_min_per_km=pace_min_per_km
    )

    profile = CLUSTER_PROFILE.get(cluster, {
        "runner_level": "Unknown Runner Type",
        "training_focus": "General training",
        "recommended_training_days": 3
    })

    week_info = get_plan_week(data.plan_start_date)

    schedule = generate_schedule_by_cluster(
        cluster=cluster,
        distance=data.distance,
        pace_min_per_km=pace_min_per_km,
        plan_start_date=data.plan_start_date
    )

    total_weekly_distance = calculate_total_distance(schedule)

    new_schedule = RunningScheduleDB(
        user_id=current_user.id,
        title=data.title or "My Running Schedule",
        distance=data.distance,
        pace_min_per_km=pace_min_per_km,
        pace=float_pace_to_string(pace_min_per_km),
        cluster=cluster,
        runner_level=profile["runner_level"],
        training_focus=profile["training_focus"],
        recommended_training_days=profile["recommended_training_days"],
        week_start_date=week_info["week_start_date"],
        week_end_date=week_info["week_end_date"],
        total_weekly_distance_km=total_weekly_distance,
        schedule_json=json.dumps(schedule, ensure_ascii=False),
        created_at=datetime.utcnow(),
        updated_at=datetime.utcnow()
    )

    db.add(new_schedule)
    db.commit()
    db.refresh(new_schedule)

    return {
        "message": "Running schedule has been saved successfully.",
        "data": db_schedule_to_response(new_schedule)
    }


@app.get("/schedules")
def get_all_schedules(
    db: Session = Depends(get_db),
    current_user: UserDB = Depends(get_current_user)
):
    schedules = db.query(RunningScheduleDB).filter(
        RunningScheduleDB.user_id == current_user.id
    ).order_by(RunningScheduleDB.id.desc()).all()

    return {
        "total": len(schedules),
        "data": [db_schedule_to_response(item) for item in schedules]
    }


@app.get("/schedules/{schedule_id}")
def get_schedule_by_id(
    schedule_id: int,
    db: Session = Depends(get_db),
    current_user: UserDB = Depends(get_current_user)
):
    schedule_db = db.query(RunningScheduleDB).filter(
        RunningScheduleDB.id == schedule_id,
        RunningScheduleDB.user_id == current_user.id
    ).first()

    if not schedule_db:
        raise HTTPException(
            status_code=404,
            detail="Schedule not found."
        )

    return db_schedule_to_response(schedule_db)


@app.put("/schedules/{schedule_id}")
def update_full_schedule(
    schedule_id: int,
    data: UpdateScheduleRequest,
    db: Session = Depends(get_db),
    current_user: UserDB = Depends(get_current_user)
):
    schedule_db = db.query(RunningScheduleDB).filter(
        RunningScheduleDB.id == schedule_id,
        RunningScheduleDB.user_id == current_user.id
    ).first()

    if not schedule_db:
        raise HTTPException(
            status_code=404,
            detail="Schedule not found."
        )

    if data.title is not None:
        schedule_db.title = data.title

    if data.schedule is not None:
        new_schedule = [pydantic_to_dict(item) for item in data.schedule]
        new_schedule = json_safe_schedule(new_schedule)

        schedule_db.schedule_json = json.dumps(new_schedule, ensure_ascii=False)
        schedule_db.total_weekly_distance_km = calculate_total_distance(new_schedule)

        dates = [
            datetime.strptime(item["date"], "%Y-%m-%d").date()
            for item in new_schedule
            if item.get("date")
        ]

        if dates:
            schedule_db.week_start_date = min(dates)
            schedule_db.week_end_date = max(dates)

    schedule_db.updated_at = datetime.utcnow()

    db.commit()
    db.refresh(schedule_db)

    return {
        "message": "Schedule has been updated successfully.",
        "data": db_schedule_to_response(schedule_db)
    }


@app.patch("/schedules/{schedule_id}/day/{day}")
def update_schedule_day(
    schedule_id: int,
    day: str,
    data: UpdateDayRequest,
    db: Session = Depends(get_db),
    current_user: UserDB = Depends(get_current_user)
):
    schedule_db = db.query(RunningScheduleDB).filter(
        RunningScheduleDB.id == schedule_id,
        RunningScheduleDB.user_id == current_user.id
    ).first()

    if not schedule_db:
        raise HTTPException(
            status_code=404,
            detail="Schedule not found."
        )

    schedule = json.loads(schedule_db.schedule_json)

    selected_day = None

    for item in schedule:
        if item["day"].lower() == day.lower():
            selected_day = item
            break

    if selected_day is None:
        raise HTTPException(
            status_code=404,
            detail=f"Day '{day}' was not found in the schedule."
        )

    update_data = pydantic_to_dict(data, exclude_unset=True)

    for key, value in update_data.items():
        selected_day[key] = value

    schedule_db.schedule_json = json.dumps(schedule, ensure_ascii=False)
    schedule_db.total_weekly_distance_km = calculate_total_distance(schedule)
    schedule_db.updated_at = datetime.utcnow()

    db.commit()
    db.refresh(schedule_db)

    return {
        "message": f"{day} schedule has been updated successfully.",
        "data": db_schedule_to_response(schedule_db)
    }


@app.delete("/schedules/{schedule_id}")
def delete_schedule(
    schedule_id: int,
    db: Session = Depends(get_db),
    current_user: UserDB = Depends(get_current_user)
):
    schedule_db = db.query(RunningScheduleDB).filter(
        RunningScheduleDB.id == schedule_id,
        RunningScheduleDB.user_id == current_user.id
    ).first()

    if not schedule_db:
        raise HTTPException(
            status_code=404,
            detail="Schedule not found."
        )

    db.delete(schedule_db)
    db.commit()

    return {
        "message": "Schedule has been deleted successfully.",
        "deleted_id": schedule_id
    }