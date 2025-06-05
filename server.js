const express = require('express');
const session = require('express-session');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const authRoutes = require('./routes/auth');
const eventsRouter = require("./routes/events");
const programsRouter = require("./routes/programs");
const paymentRouter = require("./routes/payments");
const programPaymentRouter = require("./routes/program_payments");
const app = express();

app.use(express.json());

app.use(cors({
  origin: 'http://localhost:8080', 
  credentials: true,
   methods: ['GET', 'POST', 'PUT', 'DELETE'],
}));

app.use(session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: { 
    sameSite:'lax',// or 'none' if https & cross-site
    secure: false }, // Use `true` if HTTPS
}));

app.use('/api/auth', authRoutes);
// app.use("/uploads", express.static(path.join(__dirname, "uploads")));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

app.use('/events', eventsRouter);

app.use('/programs',programsRouter);

app.use('/payments',paymentRouter);

app.use('/program-payments', programPaymentRouter);

app.listen(process.env.PORT, () =>
  console.log(`Server running on port ${process.env.DB_PORT}`)
);
