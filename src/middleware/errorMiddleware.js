export const notFound = (req, res) => res.status(404).json({ message: `Route not found: ${req.originalUrl}` });

export const errorHandler = (err, req, res, next) => {
  console.error(err);
  let status = res.statusCode >= 400 ? res.statusCode : 500;
  let message = err.message || "Server error";
  if (err.code === 11000) { status = 400; message = "Email already registered"; }
  if (err.name === "CastError") { status = 400; message = "Invalid id"; }
  res.status(status).json({ message });
};
