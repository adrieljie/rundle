from datetime import datetime
from sqlalchemy import create_engine, Column, Integer, String, Float, Text, DateTime, Date, ForeignKey
from sqlalchemy.orm import sessionmaker, declarative_base


DATABASE_URL = "sqlite:///./running_schedule.db"

engine = create_engine(
    DATABASE_URL,
    connect_args={"check_same_thread": False}
)

SessionLocal = sessionmaker(
    autocommit=False,
    autoflush=False,
    bind=engine
)

Base = declarative_base()

class UserDB(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String)
    email = Column(String, unique=True, index=True, nullable=False)
    password_hash = Column(String, nullable=False)

    created_at = Column(DateTime, default=datetime.utcnow)


class RunningScheduleDB(Base):
    __tablename__ = "running_schedules"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    title = Column(String, default="My Running Schedule")

    distance = Column(Float)
    pace_min_per_km = Column(Float)
    pace = Column(String)

    cluster = Column(Integer)
    runner_level = Column(String)
    training_focus = Column(String)
    recommended_training_days = Column(Integer)

    week_start_date = Column(Date)
    week_end_date = Column(Date)

    total_weekly_distance_km = Column(Float)
    schedule_json = Column(Text)

    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow)


def create_tables():
    Base.metadata.create_all(bind=engine)


def get_db():
    db = SessionLocal()

    try:
        yield db
    finally:
        db.close()