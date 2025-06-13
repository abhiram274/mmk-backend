const express = require('express');
const session = require('express-session');

// const RedisStore = require('connect-redis')(session);
// const redis = require('redis');

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

  origin: 'https://mmkuniverse-main.vercel.app', 

  // origin: ['http://localhost:8080', 'https://mmkuniverse-main.vercel.app'], 

   credentials: true,
   methods: ['GET', 'POST', 'PUT', 'DELETE'],
}));

// app.use(session({
//   secret: process.env.SESSION_SECRET,
//   resave: false,
//   saveUninitialized: false,
//   cookie: { 
//     sameSite:'none',// or 'none' if https & cross-site
//     secure: true }, // Use `true` if HTTPS
// }));


// app.use(cors({
//   origin: function (origin, callback) {
//     const allowed = [
//       'http://localhost:8080',
//       'https://mmkuniverse-main.vercel.app',
//     ];

//     if (!origin || allowed.includes(origin) || origin.endsWith('.vercel.app')) {
//       callback(null, true);
//     } else {
//       callback(new Error('Not allowed by CORS'));
//     }
//   },
//   credentials: true,
//   methods: ['GET', 'POST', 'PUT', 'DELETE'],
// }));

app.use('/api/auth', authRoutes);


// app.use("/uploads", express.static(path.join(__dirname, "uploads")));
// app.use('/uploads', express.static(path.join(__dirname, 'uploads')));


app.use('/api/auth', authRoutes);

app.use('/events', eventsRouter);

app.use('/programs',programsRouter);

app.use('/payments',paymentRouter);

app.use('/program-payments', programPaymentRouter);



// app.use(express.static(path.join(__dirname, 'build')));

// // After your API routes, send index.html for all other requests (i.e., frontend routes)
// app.get('*', (req, res) => {
//   res.sendFile(path.join(__dirname, 'build', 'index.html'));

// app.use(express.static(path.join(__dirname, 'frontend')));

// // // After your API routes, send index.html for all other requests (i.e., frontend routes)
// app.get('*', (req, res) => {
//   res.sendFile(path.join(__dirname, 'frontend', 'index.html'));

// });



app.listen(process.env.PORT, () =>
  console.log(`Server running on port ${process.env.DB_PORT}`)
);
