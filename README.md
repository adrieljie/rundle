# About Rundle AI

Rundle is an AI-based running schedule web application that generates a personalized weekly running plan based on the user's weekly distance and average pace. The system classifies the runner profile using a machine learning model and provides a structured 7-day training schedule with workout type, target distance, target pace, and training notes.

## Live Demo

* Frontend: [https://rundle-ai.vercel.app](https://rundle-ai.vercel.app)
* Backend API: [https://adrieljie-rundle-backend.hf.space](https://adrieljie-rundle-backend.hf.space)

## Features

* Generate a weekly running schedule based on user input
* Predict runner profile using an AI model
* Display runner level, training focus, and recommended training days
* Save generated running schedules
* View saved schedules
* Edit daily running schedule details
* Delete saved schedules
* Responsive dashboard interface
* Frontend deployed on Vercel
* Backend deployed on Hugging Face Spaces

## Tech Stack

### Frontend

* React.js
* Vite
* JavaScript
* CSS
* Vercel

### Backend

* FastAPI
* Python
* Scikit-learn
* Pandas
* NumPy
* SQLAlchemy
* SQLite
* Hugging Face Spaces

### Machine Learning

* KMeans Clustering
* Joblib model deployment

## Project Structure

```txt
Project/
├── frontend/
│   ├── public/
│   ├── src/
│   │   ├── App.jsx
│   │   └── App.css
│   ├── package.json
│   └── vite.config.js
│
├── backend/
│   ├── main.py
│   ├── database.py
│   ├── requirements.txt
│   ├── Dockerfile
│   ├── running_schedule.db
│   └── model/
│       └── running_schedule_model.pkl
│
└── README.md
```

## How It Works

1. The user enters a weekly running distance and average pace.
2. The backend converts the pace input into minutes per kilometer.
3. The AI model predicts the runner cluster.
4. The system maps the cluster into a runner profile.
5. A weekly running schedule is generated based on the predicted profile.
6. The user can save, view, edit, and delete running schedules.

## How to Run Locally

### Run the Backend Server

```bash
uvicorn main:app --reload
```

## Frontend Setup

### Run the Frontend

```bash
npm run dev
```
