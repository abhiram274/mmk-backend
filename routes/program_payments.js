const express = require("express");
const router = express.Router();
const db = require("../db");

const multer = require("multer");
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const cloudinary = require('cloudinary').v2;


const path = require("path");
const nodemailer = require("nodemailer");
const fs = require('fs');
require("dotenv").config();




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
  const { userId, transactionId } = req.body;
  const programId = req.params.id;
  const paymentImage = req.file;

  if (!userId || !transactionId || !programId || !paymentImage) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  const isValidFormat = /^[A-Z0-9]{12}$/.test(transactionId);
  if (!isValidFormat) {
    return res.status(400).json({ error: "Invalid transaction ID format" });
  }

  try {
    // Check if this user has already requested
    const [existingRequest] = await db.query(
      "SELECT * FROM program_payment_requests WHERE user_id = ? AND program_id = ?",
      [userId, programId]
    );

    if (existingRequest.length > 0) {
      return res.status(400).json({ error: "Already submitted. Awaiting admin approval." });
    }

    // Insert into payment request table
    await db.query(
      "INSERT INTO program_payment_requests (user_id, program_id, transaction_id, payment_image_path,status) VALUES (?, ?, ?, ?,'pending')",
      [userId, programId, transactionId, paymentImage.filename]
    );

    res.status(200).json({ message: "Request submitted. Awaiting admin approval." });

  } catch (err) {
    console.error("Error verifying payment:", err);
    res.status(500).json({ error: "Server error" });
  }
});





async function sendConfirmationEmail(toEmail, programTitle) {
  console.log("✉️ Preparing to send confirmation email to:", toEmail);

  let transporter = nodemailer.createTransport({
    service: "gmail", // Use Gmail service
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
  });

  try {
    const info = await transporter.sendMail({
      from: `"MMK Universe Team" <${process.env.EMAIL_USER}>`,
      to: toEmail,
      subject: `Registration confirmed for ${programTitle}`,
      text: `Hello! Your registration for the program "${programTitle}" is confirmed. Thank you!`,
    });

    console.log("✅ Email sent:", info.messageId);
  } catch (err) {
    console.error("❌ Failed to send email:", err);
  }
}



// Get pending payment requests
router.get("/payment-requests", async (req, res) => {
  try {
    const [rows] = await db.query(`
 
SELECT 
        ppr.id,
        ppr.user_id,
        ppr.program_id,
        ppr.transaction_id,
        ppr.status,
        ppr.payment_image_path,
        pg.title AS program_title
      FROM program_payment_requests ppr
      JOIN programs pg ON ppr.program_id = pg.id

    WHERE ppr.status = 'pending'
    ORDER BY ppr.created_at DESC
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
    const [[request]] = await db.query("SELECT * FROM program_payment_requests WHERE id = ?", [id]);
    if (!request) return res.status(404).json({ error: "Request not found" });

    const { user_id, program_id, transaction_id, payment_image_path, submission_type,
      guest_name,
      guest_email, } = request;

    // 2. Prevent duplicates
    let existing;
    if (submission_type === "guest") {
      [existing] = await db.query(
        "SELECT * FROM program_attendees WHERE guest_email = ? AND program_id = ?",
        [guest_email, program_id]
      );
    } else {
      [existing] = await db.query(
        "SELECT * FROM program_attendees WHERE user_id = ? AND program_id = ?",
        [user_id, program_id]
      );
    }

    if (existing.length > 0) {
      return res.status(400).json({ error: "User already joined" });
    }


    // 3. Approve and insert into program_attendees
    if (submission_type === "guest") {
      await db.query(
        `INSERT INTO program_attendees (program_id, transaction_id, guest_name, guest_email)
            VALUES (?, ?, ?, ?)`,
        [program_id, transaction_id, guest_name, guest_email]
      );
    } else {
      await db.query(`
      INSERT INTO program_attendees (user_id, program_id, transaction_id)
      VALUES (?, ?, ?)
    `, [user_id, program_id, transaction_id]);

      }

      await db.query(`
      UPDATE programs SET attendees = (
        SELECT COUNT(*) FROM program_attendees WHERE program_id = ?
      ) WHERE id = ?
    `, [program_id, program_id]
  );

      //update attendees count
      await db.query(
        "UPDATE program_payment_requests SET status = 'approved' WHERE id = ?",
        [id]);


      // Delete uploaded image
     if (payment_image_path && payment_image_path.includes("cloudinary.com")) {
  try {
    // Extract public_id from the full URL
    const urlParts = payment_image_path.split('/');
    const fileNameWithExt = urlParts[urlParts.length - 1]; // e.g., abc123xyz.jpg
    const folder = urlParts[urlParts.length - 2];           // e.g., my-app-uploads

    const public_id = `${folder}/${fileNameWithExt.split('.')[0]}`; // remove extension

    await cloudinary.uploader.destroy(public_id);
    console.log("🗑️ Cloudinary image deleted:", public_id);
  } catch (err) {
    console.error("Failed to delete Cloudinary image:", err);
  }
}


 // 7. Send confirmation email
    let email, event_title;

    if (submission_type === "guest") {
      email = guest_email;
    } else {
      const [[user]] = await db.query("SELECT email FROM users WHERE user_id = ?", [user_id]);
      email = user?.email;
    }

    const [[program]] = await db.query("SELECT title FROM programs WHERE id = ?", [program_id]);
    program_title = program?.title;

    console.log("📨 Sending email to:", email, "for program:", program_title);



    if (!email) {
  console.error("❌ Email address is missing, cannot send confirmation");
  return res.status(500).json({ error: "Missing recipient email" });
}
    await sendConfirmationEmail(email, program_title);

      res.json({ message: "Payment approved and user added to Program" });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Server error" });
    }
  });



// Reject a payment request
router.post("/payment-requests/:id/reject", async (req, res) => {
  const { id } = req.params;
  try {
    const [[request]] = await db.query("SELECT * FROM program_payment_requests WHERE id = ?", [id]);
    if (!request) return res.status(404).json({ error: "Request not found" });


    await db.query("UPDATE program_payment_requests SET status = 'rejected' WHERE id = ?", [id]);

    // Delete image
if (payment_image_path && payment_image_path.includes("cloudinary.com")) {
  try {
    // Extract public_id from the full URL
    const urlParts = payment_image_path.split('/');
    const fileNameWithExt = urlParts[urlParts.length - 1]; // e.g., abc123xyz.jpg
    const folder = urlParts[urlParts.length - 2];           // e.g., my-app-uploads

    const public_id = `${folder}/${fileNameWithExt.split('.')[0]}`; // remove extension

    await cloudinary.uploader.destroy(public_id);
    console.log("🗑️ Cloudinary image deleted:", public_id);
  } catch (err) {
    console.error("Failed to delete Cloudinary image:", err);
  }
}




    res.json({ message: "Payment rejected" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});




router.post("/:id/guest-verify-payment", upload.single("paymentImage"), async (req, res) => {
  const program_id = req.params.id;   // from URL param
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
      "SELECT * FROM program_payment_requests WHERE guest_email = ? AND program_id = ? AND status = 'pending'",
      [guest_email, program_id]
    );

    if (existingRequest.length > 0) {
      return res.status(400).json({ error: "Already submitted. Awaiting approval." });
    }


    const [alreadyAttending] = await db.query(
      `SELECT * FROM program_attendees 
       WHERE guest_email = ? AND program_id = ?`,
      [guest_email, program_id]
    );

    if (alreadyAttending.length > 0) {
      return res.status(400).json({ error: "You have already joined this program." });
    }



    await db.query(
      `INSERT INTO program_payment_requests 
        (program_id, transaction_id, payment_image_path, guest_name, guest_email, status,submission_type)
       VALUES (?, ?, ?, ?, ?, 'pending','guest')`,
      [program_id, transaction_id, paymentImage.filename, guest_name, guest_email]
    );

    res.status(200).json({ message: "Guest request submitted. Awaiting approval." });
  } catch (err) {
    console.error("Error in guest verify:", err);
    res.status(500).json({ error: "Transaction Id already existed" });
  }
});



module.exports = router;



