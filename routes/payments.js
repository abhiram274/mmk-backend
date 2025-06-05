const express = require("express");
const router = express.Router();
const db = require("../db");
const multer = require("multer");
const path = require("path");
const nodemailer = require("nodemailer");
const fs = require('fs');
require("dotenv").config();


// Setup multer to store uploaded files in "uploads/" folder
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, "uploads/"); // use existing folder
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname);
    cb(null, `payment-${uniqueSuffix}${ext}`);
  },
});

const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    // Accept image files only
    if (!file.mimetype.startsWith("image/")) {
      return cb(new Error("Only image files are allowed"), false);
    }
    cb(null, true);
  },
});


// verify-payment
router.post("/:id/verify-payment", upload.single("paymentImage"), async (req, res) => {
  const { userId, name, email, transactionId } = req.body;
  const eventId = req.params.id;
  const paymentImage = req.file;
  
  if (!userId || !transactionId || !eventId || !paymentImage) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  const isValidFormat = /^[A-Z0-9]{12}$/.test(transactionId);
  if (!isValidFormat) {
    return res.status(400).json({ error: "Invalid transaction ID format" });
  }

  try {
    // Check if this user has already requested
    const [existingRequest] = await db.query(
      "SELECT * FROM event_payment_requests WHERE user_id = ? AND user_name=? AND user_mail =? AND event_id = ? AND status = 'pending'",
      [userId, name, email,eventId]
    );

    if (existingRequest.length > 0) {
      return res.status(400).json({ error: "Already submitted. Awaiting admin approval." });
    }

    // Insert into payment request table
    await db.query(
      "INSERT INTO event_payment_requests (user_id,user_name, user_mail, event_id, transaction_id, payment_image_path,status) VALUES (?, ?, ?, ?, ?, ?,'pending')",
      [userId, name, email, eventId, transactionId, paymentImage.filename]
    );

    res.status(200).json({ message: "Request submitted. Awaiting admin approval." });

  } catch (err) {
    console.error("Error verifying payment:", err);
    res.status(500).json({ error: "Server error" });
  }
});



//Mailer
async function sendConfirmationEmail(toEmail, eventTitle) {
  console.log("✉️ Preparing to send confirmation email to:", toEmail);

  let transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
  });

  try {
    const info = await transporter.sendMail({
      from: `"MMK Universe Team" <${process.env.EMAIL_USER}>`,
      to: toEmail,
      subject: `Registration confirmed for ${eventTitle}`,
      text: `Hello! Your registration for the event "${eventTitle}" is confirmed. Thank you!`,
    });

    console.log("✅ Email sent:", info.messageId);
  } catch (err) {
    console.error("❌ Failed to send email:", err);
  }
}

//  SELECT p.*, e.title AS event_title 
//   FROM event_payment_requests p
//   JOIN events e ON p.event_id = e.id


// Get pending payment requests
router.get("/payment-requests", async (req, res) => {
  try {
    const [rows] = await db.query(`
 
SELECT 
        epr.id,
        epr.user_id,
        epr.event_id,
        epr.transaction_id,
        epr.status,
        epr.payment_image_path,
        epr.submission_type,
        ev.title AS event_title
      FROM event_payment_requests epr
      JOIN events ev ON epr.event_id = ev.id

    WHERE epr.status = 'pending'
    ORDER BY epr.created_at DESC
  `);
    res.json(rows);
  }
  catch (err) {
    console.error("Fetch error:", err);
    res.status(500).json({ error: "Server error" });
  }


});





// Approve a payment request
router.post("/payment-requests/:id/approve", async (req, res) => {
  const { id } = req.params;

  try {
    // 1. Get the payment request
    const [[request]] = await db.query(
      "SELECT * FROM event_payment_requests WHERE id = ?",
      [id]
    );

    if (!request) {
      return res.status(404).json({ error: "Request not found" });
    }

    const {
      user_id,
      user_name,
      user_mail,
      event_id,
      transaction_id,
      payment_image_path,
      submission_type,
      guest_name,
      guest_email,
    } = request;

    // 2. Prevent duplicates
    let existing;
    if (submission_type === "guest") {
      [existing] = await db.query(
        "SELECT * FROM event_attendees WHERE guest_email = ? AND event_id = ?",
        [guest_email, event_id]
      );
    } 
    else {
      [existing] = await db.query(
        "SELECT * FROM event_attendees WHERE user_id = ? AND event_id = ?",
        [user_id, event_id]
      );
    }

    if (existing.length > 0) {
      return res.status(400).json({ error: "User already joined" });
    }


    
    // 3. Approve and insert into event_attendees
    if (submission_type === "guest") {
      await db.query(
        `INSERT INTO event_attendees (event_id, transaction_id, guest_name, guest_email)
         VALUES (?, ?, ?, ?)`,
        [event_id, transaction_id, guest_name, guest_email]
      );
    } 
    else {
      await db.query(
        `INSERT INTO event_attendees (user_id, user_name, user_mail, event_id, transaction_id)
         VALUES (?, ?, ?,  ?, ?)`,
        [user_id, user_name, user_mail,  event_id, transaction_id]
      );
    }

    // 4. Update attendees count in events table
    await db.query(
      `UPDATE events SET attendees = (
         SELECT COUNT(*) FROM event_attendees WHERE event_id = ?
       ) WHERE id = ?`,
      [event_id, event_id]
    );

    // 5. Mark payment request as approved
    await db.query(
      "UPDATE event_payment_requests SET status = 'approved' WHERE id = ?",
      [id]
    );

    // 6. Delete uploaded image
    if (payment_image_path) {
      const filePath = path.join(__dirname, "../uploads", payment_image_path);
      fs.unlink(filePath, (err) => {
        if (err) console.error("Failed to delete image:", err);
      });
    }



    // 7. Send confirmation email
    let email, event_title;

    if (submission_type === "guest") {
      email = guest_email;
    } else {
      const [[user]] = await db.query("SELECT email FROM users WHERE user_id = ?", [user_id]);
      email = user?.email;
    }

    const [[event]] = await db.query("SELECT title FROM events WHERE id = ?", [event_id]);
    event_title = event?.title;

    console.log("📨 Sending email to:", email, "for event:", event_title);



    if (!email) {
  console.error("❌ Email address is missing, cannot send confirmation");
  return res.status(500).json({ error: "Missing recipient email" });
}
    await sendConfirmationEmail(email, event_title);


  


    res.json({ message: "Payment approved and user added to event" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Transaction Id already existed" });
  }
});




// Reject a payment request
router.post("/payment-requests/:id/reject", async (req, res) => {
  const { id } = req.params;
  try {
    const [[request]] = await db.query("SELECT * FROM event_payment_requests WHERE id = ?", [id]);
    if (!request) return res.status(404).json({ error: "Request not found" });


    await db.query("UPDATE event_payment_requests SET status = 'rejected' WHERE id = ?", [id]);

    // Delete image
    if (request.payment_image_path) {
      const filePath = path.join(__dirname, "../uploads", request.payment_image_path);
      fs.unlink(filePath, (err) => {
        if (err) console.error("Failed to delete image:", err);
      });
    }




    res.json({ message: "Payment rejected" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});





router.post("/:id/guest-verify-payment", upload.single("paymentImage"), async (req, res) => {
  const event_id = req.params.id;   // from URL param
  const { guest_name, guest_email, transaction_id } = req.body;
  const paymentImage = req.file;

  if (!guest_name || !guest_email || !transaction_id || !paymentImage) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  const isValidFormat = /^[A-Z0-9]{12}$/.test(transaction_id);
  if (!isValidFormat) {
    return res.status(400).json({ error: "Invalid transaction ID format" });
  }

  try {
    const [existingRequest] = await db.query(
      "SELECT * FROM event_payment_requests WHERE guest_email = ? AND event_id = ? AND status = 'pending'",
      [guest_email, event_id]
    );

    if (existingRequest.length > 0) {
      return res.status(400).json({ error: "Already submitted. Awaiting approval." });
    }


    const [alreadyAttending] = await db.query(
      `SELECT * FROM event_attendees 
       WHERE guest_email = ? AND event_id = ?`,
      [guest_email, event_id]
    );

    if (alreadyAttending.length > 0) {
      return res.status(400).json({ error: "You have already joined this event." });
    }


    await db.query(
      `INSERT INTO event_payment_requests 
        (event_id, transaction_id, payment_image_path, guest_name, guest_email, status,submission_type)
       VALUES (?, ?, ?, ?, ?, 'pending','guest')`,
      [event_id, transaction_id, paymentImage.filename, guest_name, guest_email]
    );
    

    res.status(200).json({ message: "Guest request submitted. Awaiting approval." });
  } catch (err) {
    console.error("Error in guest verify:", err);
    res.status(500).json({ error: "Transaction Id already existed" });
  }
});




router.get("/test-email", async (req, res) => {
  await sendConfirmationEmail("meghanalokanadham2005@gmail.com", "Abhi's Testing for email passed.....");
  res.send("Test email sent");
});


module.exports = router;
