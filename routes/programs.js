// programs.js
const express = require("express");
const router = express.Router();
const db = require("../db");
const multer = require("multer");
const path = require("path");
const ExcelJS = require('exceljs');
const { generateCertificate, sendEmail } = require('../utils/sendcertificate');

// Multer setup
const storage = multer.diskStorage({
  destination: "uploads/",
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
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



// GET all programs
router.get("/", async (req, res) => {
  try {
    const [rows] = await db.query("SELECT * FROM programs");
    rows.forEach(program => {

      if (program.image) {
        program.image = `http://localhost:5000/uploads/${program.image}`;
      }
    });
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});





// Get all *non-completed* programs
router.get("/non-complete", async (req, res) => {
  try {
    const [rows] = await db.query("SELECT * FROM programs WHERE completed = FALSE");

    rows.forEach(event => {
      if (event.image) {
        event.image = `http://localhost:5000/uploads/${event.image}`;
      }
    });

    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});




//Get Specifi Program
router.get("/:id", async (req, res) => {
  const { id } = req.params;

  try {
    const [rows] = await db.query("SELECT * FROM programs WHERE id = ?", [id]);

    if (rows.length === 0) {
      return res.status(404).json({ error: "Program not found" });
    }

    res.json(rows[0]); // return single event object
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});






//POST a new program
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
        title,
        description,
        price,
        isFree,
        isCertified,
        isLive,
        duration,
        date,
        startDate,
        endDate,
        category,
        limit,
        location,
        email
      } = req.body;

       // 🔥 Correct usage for multiple fields
      const imageFile = req.files?.image?.[0];
      const qrcodeFile = req.files?.qrcode?.[0];

      const image = imageFile ? imageFile.filename : null;
      const qrcode = qrcodeFile ? qrcodeFile.filename : null;

      
      const formattedDate = formatDate(date);
      const formattedStartDate = formatDate(startDate);
      const formattedEndDate = formatDate(endDate);
      const attendeeLimit = limit ? parseInt(limit, 10) : null;


      await db.query(
        `
      INSERT INTO programs 
      (title, description, price, start_date, end_date, isFree, isCertified, isLive, duration, date, category, image, attendance_limit, location, qrcode, email)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
        [
          title,
          description,
          price,
          formattedStartDate,                    // start_date
          formattedEndDate,                      // end_date
          isFree === "true" ? 1 : 0,            // isFree
          isCertified === "true" ? 1 : 0,       // isCertified
          isLive === "true" ? 1 : 0,            // isLive
          duration,
          formattedDate,
          category,
          image,
          attendeeLimit,
          location,
          qrcode,
          email
        ]
      );

      res.status(201).json({ message: "Event created" });
    } catch (err) {
      console.error("Error in POST /programs:", err);
      res.status(500).json({ error: err.message });
    }
  });




// In routes/events.js or a new route file
router.get("/check-attendance", async (req, res) => {
  const { userId, programId } = req.query;

  if (!userId || !programId) {
    return res.status(400).json({ error: "Missing userId or programId" });
  }

  try {
    const [rows] = await db.query(
      "SELECT * FROM program_attendees WHERE user_id = ? AND program_id = ?",
      [userId, programId]
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


 // PUT - Update a program
// router.put("/:id",
//   // upload.single("image"),
//   upload.fields([
//     { name: "image", maxCount: 1 },
//     { name: "qrcode", maxCount: 1 },
//   ]),
//   async (req, res) => {
//     const { id } = req.params;
//     const {
//       title,
//       description,
//       price,
//       isFree,
//       isCertified,
//       isLive,
//       duration,
//       date,
//       startDate,
//       endDate,
//       category,
//       limit,
//       location,
//       email
//     } = req.body;

//     // const image = req.file ? req.file.filename : null;
//     //       const qrcodeFile = req.files?.qrcode?.[0];
//     const imageFile = req.files?.image?.[0];
//     const qrcodeFile = req.files?.qrcode?.[0];

//     const image = imageFile ? imageFile.filename : null;
//     const qrcode = qrcodeFile ? qrcodeFile.filename : null;

//     const formattedDate = formatDate(date);
//     const formattedStartDate = formatDate(startDate);
//     const formattedEndDate = formatDate(endDate);

// // "isCertified = ?",
// //         "isLive = ?",
// //         "duration = ?",
       

//     try {
//       // Build query dynamically depending on whether image is updated
//       const fields = [
//         "title = ?",
//         "description = ?",
//         "price = ?",
//         "isFree = ?",
//          "date = ?",
//          "duration = ?",
//         "start_date = ?",
//         "end_date = ?",
//         "category = ?",
//         "attendance_limit = ?",
//         "location = ?",
//         "email = ?" 

//       ];

//       const values = [
//         title,
//         description,
//         price,
//         // isFree === "true" || isFree === true ? 1 : 0,
//         // isCertified === "true" || isCertified === true ? 1 : 0,
//         // isLive === "true" || isLive === true ? 1 : 0, duration,
//         duration,
//         formattedDate,
//         formattedStartDate,
//         formattedEndDate,
//         category,
//         limit || 0,
//         location,
//         email
//       ];

//          if (isFree !== undefined) {
//         fields.push("isFree = ?");
//         values.push(isFree === "true" || isFree === true ? 1 : 0);
//       }

//       if (isCertified !== undefined) {
//         fields.push("isCertified = ?");
//         values.push(isCertified === "true" || isCertified === true ? 1 : 0);
//       }

//       if (isLive !== undefined) {
//         fields.push("isLive = ?");
//         values.push(isLive === "true" || isLive === true ? 1 : 0);
//       }

//       if (image) {
//         fields.push("image = ?");
//         values.push(image);
//       }
//       if (qrcode) {
//         fields.push("qrcode = ?");
//         values.push(qrcode);
//       }


//       values.push(id); // for WHERE clause

//       const query = `UPDATE programs SET ${fields.join(", ")} WHERE id = ?`;
//       await db.query(query, values);

//       res.json({ message: "Program updated successfully" });
//     } catch (err) {
//       console.error("Error updating program:", err);
//       res.status(500).json({ error: "Failed to update program" });
//     }
//   });

//

//Update a program
router.put("/:id",
  upload.fields([
    { name: "image", maxCount: 1 },
    { name: "qrcode", maxCount: 1 },
  ]),
  async (req, res) => {
    const { id } = req.params;
    const {
      title,
      description,
      price,
      isFree,
      isCertified,
      isLive,
      duration,
      date,
      startDate,
      endDate,
      category,
      limit,
      location,
      email
    } = req.body;

    const imageFile = req.files?.image?.[0];
    const qrcodeFile = req.files?.qrcode?.[0];

    const image = imageFile ? imageFile.filename : null;
    const qrcode = qrcodeFile ? qrcodeFile.filename : null;

    const formattedDate = date ? formatDate(date) : null;
    const formattedStartDate = startDate ? formatDate(startDate) : null;
    const formattedEndDate = endDate ? formatDate(endDate) : null;

    try {
      const fields = [];
      const values = [];

      if (title !== undefined) {
        fields.push("title = ?");
        values.push(title);
      }

      if (description !== undefined) {
        fields.push("description = ?");
        values.push(description);
      }

      if (price !== undefined) {
        fields.push("price = ?");
        values.push(price);
      }

      if (isFree !== undefined) {
        fields.push("isFree = ?");
        values.push(isFree === "true" || isFree === true ? 1 : 0);
      }

      if (isCertified !== undefined) {
        fields.push("isCertified = ?");
        values.push(isCertified === "true" || isCertified === true ? 1 : 0);
      }

      if (isLive !== undefined) {
        fields.push("isLive = ?");
        values.push(isLive === "true" || isLive === true ? 1 : 0);
      }

      if (duration !== undefined) {
        fields.push("duration = ?");
        values.push(duration);
      }

      if (formattedDate !== null) {
        fields.push("date = ?");
        values.push(formattedDate);
      }

      if (formattedStartDate !== null) {
        fields.push("start_date = ?");
        values.push(formattedStartDate);
      }

      if (formattedEndDate !== null) {
        fields.push("end_date = ?");
        values.push(formattedEndDate);
      }

      if (category !== undefined) {
        fields.push("category = ?");
        values.push(category);
      }

      if (limit !== undefined) {
        fields.push("attendance_limit = ?");
        values.push(limit);
      }

      if (location !== undefined) {
        fields.push("location = ?");
        values.push(location);
      }

      if (email !== undefined) {
        fields.push("email = ?");
        values.push(email);
      }

      if (image) {
        fields.push("image = ?");
        values.push(image);
      }

      if (qrcode) {
        fields.push("qrcode = ?");
        values.push(qrcode);
      }

      if (fields.length === 0) {
        return res.status(400).json({ error: "No fields to update" });
      }

      values.push(id);

      const query = `UPDATE programs SET ${fields.join(", ")} WHERE id = ?`;
      await db.query(query, values);

      res.json({ message: "Program updated successfully" });
    } catch (err) {
      console.error("Error updating program:", err);
      res.status(500).json({ error: "Failed to update program" });
    }
  }
);








// DELETE - Delete a program
router.delete("/:id", async (req, res) => {
  const { id } = req.params;

  try {
    await db.query("DELETE FROM programs WHERE id = ?", [id]);
    res.json({ message: "Program deleted successfully" });
  } catch (err) {
    console.error("Error deleting program:", err);
    res.status(500).json({ error: "Failed to delete program" });
  }
});



// GET all programs with optional user_id query to check enrollment
router.get("/", async (req, res) => {
  const userId = req.query.user_id;  // Optional

  try {
    // Fetch all programs
    const [programs] = await db.query("SELECT * FROM programs");

    // If userId passed, fetch all program_attendees of this user
    let enrolledProgramIds = [];
    if (userId) {
      const [program_attendees] = await db.query(
        "SELECT program_id FROM program_attendees WHERE user_id = ?",
        [userId]
      );
      enrolledProgramIds = program_attendees.map(e => e.program_id);
    }

    // Attach isEnrolled flag and adjust image URL
    const result = programs.map(program => ({
      ...program,
      image: program.image ? `http://localhost:5000/uploads/${program.image}` : "",
      isFree: Boolean(program.isFree),
      isCertified: Boolean(program.isCertified),
      isLive: Boolean(program.isLive),
      isEnrolled: userId ? enrolledProgramIds.includes(program.id) : false,
    }));

    res.json(result);
  } catch (err) {
    console.error("Error fetching programs:", err);
    res.status(500).json({ error: err.message });
  }
});





// Get all programs enrolled by a user
router.get('/user-programs/:userId', async (req, res) => {
  const { userId } = req.params;

  try {
    const [events] = await db.query(`
      SELECT p.* 
      FROM programs p
      JOIN program_attendees e ON e.program_id = p.id
      WHERE e.user_id = ?
    `, [userId]);

    res.json(events);
  } catch (err) {
    console.error("Error in GET /user-programs/:userId:", err);
    res.status(500).json({ error: "Failed to fetch user programs." });
  }
});




//Mark Program as completed
router.put("/:id/complete", async (req, res) => {
  const { id } = req.params;

  try {
    await db.query("UPDATE programs SET completed = TRUE WHERE id = ?", [id]);
    res.json({ message: "Program marked as completed" });
  } catch (err) {
    console.error("Error completing program:", err);
    res.status(500).json({ error: "Failed to complete program" });
  }
});



//export excel
router.get('/:programId/export-excel', async (req, res) => {
  const { programId } = req.params;

  try {
    const [attendees] = await db.query(`
      SELECT 
        p.id AS program_id,
        p.title AS program_name,
        u.user_id AS user_id,
        u.name AS user_name,
        u.email AS user_email
      FROM program_attendees pa
      JOIN users u ON pa.user_id = u.user_id
      JOIN programs p ON pa.program_id = p.id
      WHERE pa.program_id = ?
    `, [programId]);

    if (!attendees.length) {
      return res.status(404).json({ error: "No attendees found" });
    }

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("Attendees");

    worksheet.columns = [
      { header: "Program ID", key: "program_id", width: 10 },
      { header: "Program Name", key: "program_name", width: 30 },
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
      `attachment; filename=program_${programId}_attendees.xlsx`
    );

    await workbook.xlsx.write(res);
    res.end();

  } catch (err) {
    console.error("Error exporting Excel:", err);
    res.status(500).json({ error: "Failed to export Excel file." });
  }
});



// GET attendees for an programs
router.get("/:programId/attendees", async (req, res) => {
  const { programId } = req.params;

  try {
    const [rows] = await db.query(
      `SELECT 
         pa.user_id,
         pa.guest_email,
         u.name AS user_name,
         pa.guest_name,
         pa.participated
       FROM program_attendees pa
       LEFT JOIN users u ON pa.user_id = u.user_id
       WHERE pa.program_id = ?`,
      [programId]
    );

    res.json({ attendees: rows });
  } catch (err) {
    console.error("❌ Error fetching attendees:", err);
    res.status(500).json({ error: "Server error" });
  }
});


// 🚀 New API route to send certificates
router.post("/send-certificates/:programId", async (req, res) => {
  const { programId } = req.params;
  const { type } = req.query; // 'joined' or 'participated'

  if (!['joined', 'participated'].includes(type)) {
    return res.status(400).json({ error: 'Invalid type. Use "joined" or "participated".' });
  }

  try {
    // If 'participated', filter by participated=1; else get all attendees.
    const participationCondition = type === 'participated' ? 'AND ea.participated = 1' : '';

    const [attendees] = await db.query(`
      SELECT 
        COALESCE(u.name, pa.guest_name) AS name,
        COALESCE(u.email, pa.guest_email) AS email,
        p.title AS program_name
      FROM program_attendees pa
      LEFT JOIN users u ON u.user_id = pa.user_id
      JOIN programs e ON p.id = pa.program_id
      WHERE pa.program_id = ?
      ${participationCondition}
    `, [programId]);

    if (attendees.length === 0) {
      return res.status(404).json({ message: `No ${type} users found for this program.` });

    }

    for (const attendee of attendees) {
      const certPath = generateCertificate(attendee.name, attendee.program_name);
      await sendEmail(attendee.email, attendee.name, certPath);
    }

    res.json({ message: `Certificates sent to ${type} attendees.` });
  } catch (err) {
    console.error("Error sending certificates:", err);
    res.status(500).json({ error: 'Failed to send certificates' });
  }
});




//Mark user as participated
router.put("/:programId/mark-participation", async (req, res) => {
  const { userId, guestEmail } = req.body;
  const programId = req.params.programId;

  // if (!programId || (!userId && !guestEmail)) {
  //   return res.status(400).json({ error: "Missing userId or guestEmail, or programtId" });
  // }

  try {
    let result;

    if (guestEmail) {
      [result] = await db.query(
        "UPDATE program_attendees SET participated = TRUE WHERE program_id = ? AND guest_email = ? AND participated = FALSE",
        [programId, guestEmail]
      );
    }  else if (userId) {
          // Mark participation by user ID
          [result] = await db.query(
            "UPDATE program_attendees SET participated = TRUE WHERE program_id = ? AND user_id = ? AND participated = FALSE",
            [programId, userId]
          );
        } else {
          return res.status(400).json({ error: "Either userId or guestEmail must be provided" });
        }

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: "Already marked or not found" });
    }

    res.json({ message: "Participation marked successfully" });
  } catch (err) {
    console.error("❌ Error marking participation:", err);
    res.status(500).json({ error: "Server error" });
  }
});




module.exports = router;


