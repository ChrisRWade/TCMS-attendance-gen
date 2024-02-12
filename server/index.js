const express = require("express");
const app = express();
const cors = require("cors");
const port = 3001; // Ensure this is different from your React app's port
const ADODB = require("node-adodb");
const connection = ADODB.open(
  "Provider=Microsoft.Jet.OLEDB.4.0;Data Source=../ingress.mdb;Jet OLEDB:Database Password=ingress;"
);

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
      acc[item.gName][item.Username] = {};
    }
    const date = item.AttendDate.split("T")[0]; // Extract date part from AttendDate
    if (!acc[item.gName][item.Username][date]) {
      acc[item.gName][item.Username][date] = [];
    }
    acc[item.gName][item.Username][date].push(item.checktime);
    return acc;
  }, {});

  return groupedByGName;
}

app.get("/api/report", async (req, res) => {
  const {startDate, endDate} = req.query; // Assuming dates are received in 'YYYY-MM-DD' format
  const formattedStartDate = formatDate(startDate); // Implement this function to format date
  const formattedEndDate = formatDate(endDate); // Implement this function to format date

  const query = `SELECT u.Username, ug.gName, a.AttendDate, a.checktime
FROM ((auditdata a
INNER JOIN [user] u ON a.userid = u.userid)
INNER JOIN user_group ug ON u.User_Group = ug.id)
WHERE a.AttendDate >= CDate('${formattedStartDate}') AND a.AttendDate <= CDate('${formattedEndDate}')
ORDER BY ug.gName, u.Username, a.AttendDate, a.checktime;`;

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
