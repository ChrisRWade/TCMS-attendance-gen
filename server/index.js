const express = require("express");
const app = express();
const cors = require("cors");
const port = 3001; // Ensure this is different from your React app's port
const ADODB = require("node-adodb");
require("dotenv").config(); // Load environment variables

// Determine the database source based on the environment
const dbPath =
  process.env.ENVIRONMENT === "prod"
    ? process.env.PROD_DB_PATH
    : process.env.DEV_DB_PATH ||
      "C:\\Program Files (x86)\\FingerTec\\FingerTec TCMS V3\\TCMS V3\\ingress.mdb";
const connection = ADODB.open(
  `Provider=Microsoft.Jet.OLEDB.4.0;Data Source=${dbPath};Jet OLEDB:Database Password=ingress;`
);

console.log(dbPath, "DBPATH HERE");
const fs = require("fs");
const path = `C:\\Program Files (x86)\\FingerTec\\FingerTec TCMS V3\\TCMS V3\\ingress.mdb`;

try {
  fs.accessSync(path, fs.constants.R_OK);
  console.log("File exists and is readable");
} catch (error) {
  console.error("File cannot be accessed:", error);
}

app.use(cors());

function formatDate(dateString) {
  const [year, month, day] = dateString.split("-");
  return `${month}/${day}/${year}`;
}

function groupData(data) {
  const groupedByGName = data.reduce((acc, item) => {
    if (!acc[item.gName]) {
      acc[item.gName] = {};
    }
    if (!acc[item.gName][item.Username]) {
      acc[item.gName][item.Username] = {userid: item.userid, dates: {}};
    }
    const date = item.AttendDate.split("T")[0]; // Extract date part from AttendDate
    if (!acc[item.gName][item.Username].dates[date]) {
      acc[item.gName][item.Username].dates[date] = [];
    }
    acc[item.gName][item.Username].dates[date].push(item.checktime);
    return acc;
  }, {});

  return groupedByGName;
}

app.get("/api/report", async (req, res) => {
  console.log("is this doing anything?");
  const {startDate, endDate} = req.query; // Assuming dates are received in 'YYYY-MM-DD' format
  const formattedStartDate = formatDate(startDate); // Implement this function to format date
  const formattedEndDate = formatDate(endDate); // Implement this function to format date

  const query = `SELECT u.userid, u.Username, ug.gName, a.AttendDate, a.checktime
FROM ((auditdata a
INNER JOIN [user] u ON a.userid = u.userid)
INNER JOIN user_group ug ON u.User_Group = ug.id)
WHERE a.AttendDate >= CDate('${formattedStartDate}') AND a.AttendDate <= CDate('${formattedEndDate}')
ORDER BY ug.gName, CAST(u.userid AS INT), a.AttendDate, a.checktime;`;

  try {
    const data = await connection.query(query);
    res.json(groupData(data)); // Implement groupData to organize data by gName, Username, and dates
  } catch (error) {
    console.error(error);
    res.status(500).send("Error querying the database");
  }
});

app.get("/api", (req, res) => {
  res.json({message: "Hello from server!"});
});

app.listen(port, () => {
  console.log(`Server listening at http://localhost:${port}`);
});
