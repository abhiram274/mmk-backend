const express = require("express");
const router = express.Router();
const db = require("../db");

const multer = require("multer");
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const cloudinary = require('cloudinary').v2;

const path = require("path");
const { Parser } = require('json2csv');
const ExcelJS = require('exceljs');
const { generateCertificate, sendEmail } = require('../utils/sendcertificate');


// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});


// Replace diskStorage with CloudinaryStorage
const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: 'my-app-uploads', // your Cloudinary folder name
    format: async (req, file) => {
      const ext = path.extname(file.originalname).slice(1).toLowerCase();
      return ext === 'jpg' ? 'jpeg' : ext;
    },
    public_id: (req, file) => Date.now().toString(),
  },
});

const upload = multer({ storage });


const formatDate = (inputDate) => {
  const date = new Date(inputDate);
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
};





// Get all events
router.get("/", async (req, res) => {
  try {
    const [rows] = await db.query("SELECT * FROM events");

    // rows.forEach(event => {

    //   if (event.image) {
    //     event.image = `${event.image}`;
    //   }
    // });




    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});




// Get all *non-completed* events
// router.get("/non-complete", async (req, res) => {
//   try {
//     const [rows] = await db.query("SELECT * FROM events WHERE completed = FALSE ORDER BY id DESC");


//     res.json(rows);
//   } catch (err) {
//     console.error("DB Error:", err); // 👈 log the error

//     res.status(500).json({ error: err.message + "ha" });
//   }
// });


router.get("/non-complete", async (req, res) => {
  const { user_id } = req.query;

  try {
    let [events] = await db.query("SELECT * FROM events WHERE completed = FALSE ORDER BY id DESC");

    if (user_id) {
      // Get user's enrolled events
      const [enrollments] = await db.query(
        `SELECT event_id FROM event_attendees WHERE user_id = ?`,
        [user_id]
      );
      const enrolledEventIds = new Set(enrollments.map(e => e.event_id));

      // Add isEnrolled field to each event
      events = events.map(event => ({
        ...event,
        isEnrolled: enrolledEventIds.has(event.id)
      }));
    } else {
      // If user_id not provided, set all to false
      events = events.map(event => ({
        ...event,
        isEnrolled: false
      }));
    }

    res.json(events);
  } catch (err) {
    console.error("DB Error:", err);
    res.status(500).json({ error: err.message });
  }
});




//Get Specifi Event
router.get("/:id", async (req, res) => {
  const { id } = req.params;

  try {
    const [rows] = await db.query("SELECT * FROM events WHERE id = ?", [id]);

    if (rows.length === 0) {
      return res.status(404).json({ error: "Event not found" });
    }

    res.json(rows[0]); // return single event object
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});



// Create a new event with image
router.post("/",
  //  upload.single("image"),
  upload.fields([
    { name: "image", maxCount: 1 },
    { name: "qrcode", maxCount: 1 },
  ]),

  async (req, res) => {
    try {
      console.log("Request body:", req.body);
      console.log("File:", req.file);
      const {
        title, description, date, startDate, endDate, time, location, price, organizer, category, limit, email

      } = req.body;

      const image = req.files['image'] ? req.files['image'][0].path : null;
      const qrcode = req.files['qrcode'] ? req.files['qrcode'][0].path : null;


      const formattedDate = formatDate(date); // replace 'date' from req.body
      const formattedStartDate = startDate ? formatDate(startDate) : null;

      const formattedEndDate = endDate ? formatDate(endDate) : null;
      const attendeeLimit = limit ? parseInt(limit, 10) : null;



      await db.query(
        `INSERT INTO events (title, description, date,start_date,end_date, time, location, price, organizer, category, image, attendance_limit, qrcode, email)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ? , ?, ?, ?, ?)`,
        [title, description, formattedDate, formattedStartDate,
          formattedEndDate, time, location, price, organizer, category, image, attendeeLimit, qrcode, email]
      );



      res.status(201).json({ message: "Event created" });
    } catch (err) {
      console.error("Error in POST /events:", err);
      res.status(500).json({ error: err.message });
    }
  });



//User Create Event
router.post("/user-create-event",
  //  upload.single("image"), 
  upload.fields([
    { name: "image", maxCount: 1 },
    { name: "qrcode", maxCount: 1 },
  ]),
  async (req, res) => {
    try {
      const {
        title, description, date, startDate, endDate, time,
        location, price, organizer, category, limit,
        user_id, user_name, email // 🔥 Passed from frontend
      } = req.body;

      const image = req.files["image"]
        ? req.files["image"][0].filename
        : null;

      const qrcode = req.files["qrcode"]
        ? req.files["qrcode"][0].filename
        : null;

      const formattedDate = formatDate(date);
      const formattedStartDate = startDate ? formatDate(startDate) : null;
      const formattedEndDate = endDate ? formatDate(endDate) : null;
      const attendeeLimit = limit ? parseInt(limit, 10) : null;

      // 🔹 First insert the event
      const [eventResult] = await db.query(
        `INSERT INTO events (title, description, date, start_date, end_date, time, location, price, organizer, category, image, attendance_limit, qrcode, email)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [title, description, formattedDate, formattedStartDate, formattedEndDate, time, location, price, organizer, category, image, attendeeLimit, qrcode, email]
      );

      const event_id = eventResult.insertId; // 🔥 Get the inserted event ID

      // 🔹 Then insert into user_created_events
      await db.query(
        `INSERT INTO user_created_events (user_id, user_name, email, event_id, event_name)
   VALUES (?, ?, ?, ?, ?)`,
        [user_id, user_name, email, event_id, title]
      );
      res.status(201).json({ message: "Event and user info saved" });
    } catch (err) {
      console.error("Error in POST /events:", err);
      res.status(500).json({ error: err.message });
    }
  });



// Update event
router.put("/:id",
  // upload.single("image"),
  upload.fields([
    { name: "image", maxCount: 1 },
    { name: "qrcode", maxCount: 1 },
  ]),
  async (req, res) => {
    try {
      const { id } = req.params;
      const { title, description, date, startDate, endDate, time, location, price, organizer, category, limit, email } = req.body;

      // Safely extract uploaded files
      const imageFile = req.files?.image?.[0];
      const qrcodeFile = req.files?.qrcode?.[0];

      const image = imageFile ? imageFile.path : null;     // ✅ Cloudinary URL
      const qrcode = qrcodeFile ? qrcodeFile.path : null;  // ✅ Cloudinary URL

      const formattedDate = formatDate(date);
      const formattedStartDate = formatDate(startDate);
      const formattedEndDate = formatDate(endDate);

      let query = `UPDATE events SET title = ?, description = ?, date = ?,  start_date = ?,   end_date = ?,  time = ?, location = ?, price=?, organizer = ?, category = ? ,  attendance_limit = ?, email = ?`;
      const params = [title, description, formattedDate, formattedStartDate, formattedEndDate, time, location, price, organizer, category, limit, email];

      if (image) {
        query += `, image = ?`;
        params.push(image);
      }

      // Add qrcode if present
      if (qrcode) {
        query += `, qrcode = ?`;
        params.push(qrcode);
      }


      query += ` WHERE id = ?`;
      params.push(id);

      await db.query(query, params);

      res.json({ message: "Event updated" });
    } catch (err) {
      console.error("Error in PUT /events/:id:", err);
      res.status(500).json({ error: err.message });
    }
  });


// Delete event
router.delete("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    await db.query("DELETE FROM events WHERE id = ?", [id]);
    res.json({ message: "Event deleted" });
  } catch (err) {
    console.error("Error in DELETE /events/:id:", err);
    res.status(500).json({ error: err.message });
  }
});



// Get all events joined by a user
router.get('/user-events/:userId', async (req, res) => {
  const { userId } = req.params;

  try {
    const [events] = await db.query(`
      SELECT e.* 
      FROM events e
      JOIN event_attendees ea ON ea.event_id = e.id
      WHERE ea.user_id = ?
    `, [userId]);

    res.json(events);
  } catch (err) {
    console.error("Error in GET /user-events/:userId:", err);
    res.status(500).json({ error: "Failed to fetch user events." });
  }
});





// In routes/events.js or a new route file
router.get("/check-attendance/:userId/:eventId", async (req, res) => {
  const { userId, eventId } = req.params;

  if (!userId || !eventId) {
    return res.status(400).json({ error: "Missing userId or eventId" });
  }

  try {
    const [rows] = await db.query(
      "SELECT * FROM event_attendees WHERE user_id = ? AND event_id = ?",
      [userId, eventId]
    );

    if (rows.length > 0) {
      res.json({ alreadyJoined: true });
    } else {
      res.json({ alreadyJoined: false });
    }
  } catch (err) {
    console.error("Error checking attendance:", err);
    res.status(500).json({ error: "Server error" });
  }
});


// GET user info by user_id
router.get('/users/:userId', async (req, res) => {
  const { userId } = req.params;

  try {
    const [rows] = await db.query(
      `SELECT id, user_id, name, email, phone FROM users WHERE user_id = ?`,
      [userId]
    );
    if (rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    res.json(rows[0]);
  } catch (err) {
    console.error('Error fetching user:', err);
    res.status(500).json({ error: 'Failed to fetch user' });
  }
});





// Mark event as completed
router.put("/:id/complete", async (req, res) => {
  const { id } = req.params;

  try {
    await db.query("UPDATE events SET completed = TRUE WHERE id = ?", [id]);
    res.json({ message: "Event marked as completed" });
  } catch (err) {
    console.error("Error completing event:", err);
    res.status(500).json({ error: "Failed to complete event" });
  }
});


//export excel
router.get('/:eventId/export-excel', async (req, res) => {
  const { eventId } = req.params;

  try {
    const [attendees] = await db.query(`
      SELECT 
        e.id AS event_id,
        e.title AS event_name,
        u.user_id AS user_id,
        u.name AS user_name,
        u.email AS user_email
      FROM event_attendees ea
      JOIN users u ON ea.user_id = u.user_id
      JOIN events e ON ea.event_id = e.id
      WHERE ea.event_id = ?
    `, [eventId]);

    if (!attendees.length) {
      return res.status(404).json({ error: "No attendees found" });
    }

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("Attendees");

    worksheet.columns = [
      { header: "Event ID", key: "event_id", width: 10 },
      { header: "Event Name", key: "event_name", width: 30 },
      { header: "User ID", key: "user_id", width: 10 },
      { header: "User Name", key: "user_name", width: 25 },
      { header: "User Email", key: "user_email", width: 30 },
    ];

    // Add rows
    attendees.forEach(row => worksheet.addRow(row));

    // Set headers
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    res.setHeader(
      "Content-Disposition",
      `attachment; filename=event_${eventId}_attendees.xlsx`
    );

    await workbook.xlsx.write(res);
    res.end();

  } catch (err) {
    console.error("Error exporting Excel:", err);
    res.status(500).json({ error: "Failed to export Excel file." });
  }
});



// Get hosted events by user ID
router.get("/hosted/:userId", async (req, res) => {
  const { userId } = req.params;
  try {
    const [events] = await db.query(`
      SELECT e.*, uce.event_name, uce.created_at
      FROM user_created_events uce
      JOIN events e ON uce.event_id = e.id
      WHERE uce.user_id = ?
    `, [userId]);

    res.json(events);
  } catch (err) {
    console.error("Error fetching hosted events:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});


// GET attendees for an event
router.get("/:eventId/attendees", async (req, res) => {
  const { eventId } = req.params;

  try {
    const [rows] = await db.query(
      `SELECT 
         ea.user_id,
         ea.guest_email,
         u.name AS user_name,
         ea.guest_name,
         ea.participated
       FROM event_attendees ea
       LEFT JOIN users u ON ea.user_id = u.user_id
       WHERE ea.event_id = ?`,
      [eventId]
    );

    res.json({ attendees: rows });
  } catch (err) {
    console.error("❌ Error fetching attendees:", err);
    res.status(500).json({ error: "Server error" });
  }
});



// 🚀 New API route to send certificates
router.post("/send-certificates/:eventId", async (req, res) => {
  const { eventId } = req.params;
  const { type } = req.query; // 'joined' or 'participated'
  const { description } = req.body;
  if (!['joined', 'participated'].includes(type)) {
    return res.status(400).json({ error: 'Invalid type. Use "joined" or "participated".' });
  }

  try {
    // If 'participated', filter by participated=1; else get all attendees.
    const participationCondition = type === 'participated' ? 'AND ea.participated = 1' : '';

    const [attendees] = await db.query(`
      SELECT 
        COALESCE(u.name, ea.guest_name) AS name,
        COALESCE(u.email, ea.guest_email) AS email,
        e.title AS event_name
      FROM event_attendees ea
      LEFT JOIN users u ON u.user_id = ea.user_id
      JOIN events e ON e.id = ea.event_id
      WHERE ea.event_id = ?
      ${participationCondition}
    `, [eventId]);

    if (attendees.length === 0) {
      return res.status(404).json({ message: `No ${type} users found for this event.` });
    }

    for (const attendee of attendees) {
      // const certPath = generateCertificate(attendee.name, attendee.event_name);
      const certPath = await generateCertificate(attendee.name, attendee.event_name, description);

      await sendEmail(attendee.email, attendee.name, certPath);
    }

    res.json({ message: `Certificates sent to ${type} attendees.` });
  } catch (err) {
    console.error("Error sending certificates:", err);
    res.status(500).json({ error: 'Failed to send certificates' });
  }
});



router.put("/:eventId/mark-participation", async (req, res) => {
  const { userId, guestEmail } = req.body;
  const eventId = req.params.eventId;
  try {
    let result;

    if (guestEmail) {
      // Mark participation by guest email
      [result] = await db.query(
        "UPDATE event_attendees SET participated = TRUE WHERE event_id = ? AND guest_email = ? AND participated = FALSE",
        [eventId, guestEmail]
      );
    } else if (userId) {
      // Mark participation by user ID
      [result] = await db.query(
        "UPDATE event_attendees SET participated = TRUE WHERE event_id = ? AND user_id = ? AND participated = FALSE",
        [eventId, userId]
      );
    } else {
      return res.status(400).json({ error: "Either userId or guestEmail must be provided" });
    }

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: "No matching attendee found or already marked participated" });
    }

    return res.json({ message: "Participation marked successfully" });
  } catch (err) {
    console.error("❌ Error marking participation:", err);
    return res.status(500).json({ error: "Server error" });
  }
});



module.exports = router;
