const nodemailer = require("nodemailer");
require("dotenv").config();

const transporter = nodemailer.createTransport({
  service: "gmail", // or use a custom SMTP provider
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

const sendOTPviaEmail = async (email, otp) => {
  try {
    await transporter.sendMail({
      from: `"MMK Universe" <${process.env.EMAIL_USER}>`,
      to: email,
      subject: "Your MMK Universe OTP Code",
      text: `Your OTP for MMK Universe registration is: ${otp}`,
    });

    console.log(`OTP email sent to ${email}`);
  } catch (err) {
    console.error("Failed to send OTP email:", err);
    throw err;
  }
};

module.exports = sendOTPviaEmail;
