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
const externalReportUrl = process.env.EXTERNAL_TIMEPUNCH_REPORT_URL || "";
const externalReportApiKey =
  process.env.EXTERNAL_TIMEPUNCH_API_KEY ||
  process.env.TIMEKEEPING_REPORT_API_KEY ||
  "";
const externalReportToken = process.env.EXTERNAL_TIMEPUNCH_API_TOKEN || "";
const externalReportTimeoutMs = Number.parseInt(
  process.env.EXTERNAL_TIMEPUNCH_TIMEOUT_MS || "8000",
  10
);

console.log(dbPath, "DBPATH HERE");
// const fs = require("fs");
// const path = `C:\\Program Files (x86)\\FingerTec\\FingerTec TCMS V3\\TCMS V3\\ingress.mdb`;

// try {
//   fs.accessSync(path, fs.constants.R_OK);
//   console.log("File exists and is readable");
// } catch (error) {
//   console.error("File cannot be accessed:", error);
// }

app.use(cors());
app.use(express.json({limit: "1mb"}));

function asInt(value, fieldName) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) {
    throw new Error(`Field "${fieldName}" must be an integer`);
  }
  return parsed;
}

function toDate(value, fieldName) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`Field "${fieldName}" must be a valid date/time`);
  }
  return parsed;
}

function formatAccessDateTime(dateObj) {
  const pad = n => `${n}`.padStart(2, "0");
  const month = pad(dateObj.getMonth() + 1);
  const day = pad(dateObj.getDate());
  const year = dateObj.getFullYear();
  const hours = pad(dateObj.getHours());
  const minutes = pad(dateObj.getMinutes());
  const seconds = pad(dateObj.getSeconds());
  return `${month}/${day}/${year} ${hours}:${minutes}:${seconds}`;
}

async function getNextSerialNo() {
  const [auditMaxRows, deviceMaxRows] = await Promise.all([
    connection.query("SELECT MAX(serialno) AS max_serial FROM auditdata"),
    connection.query(
      "SELECT MAX(serialno) AS max_serial FROM device_transaction_log"
    ),
  ]);

  const auditMax = Number(auditMaxRows?.[0]?.max_serial || 0);
  const deviceMax = Number(deviceMaxRows?.[0]?.max_serial || 0);
  return Math.max(auditMax, deviceMax) + 1;
}

function normalizePunch(input) {
  if (!input || typeof input !== "object") {
    throw new Error("Each punch must be an object");
  }

  const userid = asInt(input.userid, "userid");
  const punchedAt = toDate(input.punchedAt || input.checktime, "punchedAt");

  return {
    userid,
    punchedAt,
    verifycode: asInt(input.verifycode ?? 1, "verifycode"),
    checktype: asInt(input.checktype ?? 0, "checktype"),
    workcode: asInt(input.workcode ?? 0, "workcode"),
    eventType: asInt(input.eventType ?? 0, "eventType"),
    flag: asInt(input.flag ?? 1, "flag"),
    controllerDoorNo: asInt(input.controllerDoorNo ?? 0, "controllerDoorNo"),
    attendSlot: asInt(input.attendSlot ?? 0, "attendSlot"),
    ctrlSum: asInt(input.ctrlSum ?? 0, "ctrlSum"),
    isAttend: asInt(input.isAttend ?? 1, "isAttend"),
    isvalid: asInt(input.isvalid ?? 1, "isvalid"),
    auditFlag: asInt(input.auditFlag ?? input.flag ?? 1, "auditFlag"),
    auditIsAttend: asInt(
      input.auditIsAttend ?? input.isAttend ?? 1,
      "auditIsAttend"
    ),
    isreal: asInt(input.isreal ?? 1, "isreal"),
    cardNum: input.cardNum ? `${input.cardNum}`.replace(/'/g, "''") : "",
    idDevice:
      input.idDevice === undefined || input.idDevice === null
        ? null
        : asInt(input.idDevice, "idDevice"),
  };
}

app.get("/api/timepunches/schema", (req, res) => {
  res.json({
    endpoint: "/api/timepunches",
    method: "POST",
    supportsBatch: true,
    required: [
      {name: "userid", type: "integer", description: "FingerTec UserID"},
      {
        name: "punchedAt",
        type: "datetime",
        description: "Punch time (ISO 8601 preferred)",
      },
    ],
    optional: [
      {name: "verifycode", type: "integer", default: 1},
      {name: "checktype", type: "integer", default: 0},
      {name: "workcode", type: "integer", default: 0},
      {name: "eventType", type: "integer", default: 0},
      {name: "flag", type: "integer", default: 1},
      {name: "controllerDoorNo", type: "integer", default: 0},
      {name: "attendSlot", type: "integer", default: 0},
      {name: "ctrlSum", type: "integer", default: 0},
      {name: "isAttend", type: "integer", default: 1},
      {name: "isvalid", type: "integer", default: 1},
      {name: "auditFlag", type: "integer", default: 1},
      {name: "auditIsAttend", type: "integer", default: 1},
      {name: "idDevice", type: "integer", default: null},
      {name: "cardNum", type: "string", default: ""},
      {name: "isreal", type: "integer", default: 1},
    ],
    notes: [
      "The endpoint writes to both auditdata and device_transaction_log.",
      "If optional fields are omitted, server defaults are used.",
      "Use integer UserID values that already exist in the [user] table.",
    ],
  });
});

app.get("/api/timepunches/field-profile", async (req, res) => {
  try {
    const [auditRows, deviceRows] = await Promise.all([
      connection.query(
        "SELECT TOP 200 userid, verifycode, checktype, workcode, eventType, Flag, ControllerDoorNo, IsAttend, isvalid FROM auditdata ORDER BY checktime DESC"
      ),
      connection.query(
        "SELECT TOP 200 userid, verifycode, checktype, workcode, eventType, isreal FROM device_transaction_log ORDER BY checktime DESC"
      ),
    ]);

    const profile = (rows, fields) =>
      fields.reduce((acc, field) => {
        const values = Array.from(
          new Set(
            rows
              .map(r => r[field])
              .filter(v => v !== null && v !== undefined && v !== "")
          )
        )
          .sort((a, b) => Number(a) - Number(b))
          .slice(0, 20);
        acc[field] = values;
        return acc;
      }, {});

    res.json({
      sampleSize: {
        auditdata: auditRows.length,
        device_transaction_log: deviceRows.length,
      },
      auditdata: profile(auditRows, [
        "userid",
        "verifycode",
        "checktype",
        "workcode",
        "eventType",
        "Flag",
        "ControllerDoorNo",
        "IsAttend",
        "isvalid",
      ]),
      device_transaction_log: profile(deviceRows, [
        "userid",
        "verifycode",
        "checktype",
        "workcode",
        "eventType",
        "isreal",
      ]),
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      error: "Could not build field profile",
      details: error.message,
    });
  }
});

app.post("/api/timepunches", async (req, res) => {
  const inputList = Array.isArray(req.body) ? req.body : [req.body];

  if (!inputList.length) {
    return res.status(400).json({error: "Request body is empty"});
  }

  let nextSerialNo;

  try {
    nextSerialNo = await getNextSerialNo();
  } catch (error) {
    console.error("Unable to calculate next serial number", error);
    return res.status(500).json({error: "Failed to initialize serial number"});
  }

  const inserted = [];
  const rejected = [];

  for (let i = 0; i < inputList.length; i += 1) {
    try {
      const p = normalizePunch(inputList[i]);
      const serialNo = asInt(inputList[i].serialno ?? nextSerialNo, "serialno");
      const checktimeText = formatAccessDateTime(p.punchedAt);
      const attendDate = new Date(p.punchedAt);
      attendDate.setHours(0, 0, 0, 0);
      const attendDateText = formatAccessDateTime(attendDate);

      const insertAuditData = `
INSERT INTO auditdata
(serialno, userid, verifycode, checktime, checktype, workcode, eventType, Flag, ControllerDoorNo, AttendDate, AttendSlot, CtrlSum, IsAttend, isvalid, audit_checktime, audit_Flag, audit_IsAttend)
VALUES
(${serialNo}, ${p.userid}, ${p.verifycode}, CDate('${checktimeText}'), ${p.checktype}, ${p.workcode}, ${p.eventType}, ${p.flag}, ${p.controllerDoorNo}, CDate('${attendDateText}'), ${p.attendSlot}, ${p.ctrlSum}, ${p.isAttend}, ${p.isvalid}, CDate('${checktimeText}'), ${p.auditFlag}, ${p.auditIsAttend})
`;

      const insertDeviceLog = `
INSERT INTO device_transaction_log
(serialno, userid, verifycode, checktime, checktype, workcode, eventType, cardNum, isreal${p.idDevice === null ? "" : ", idDevice"})
VALUES
(${serialNo}, ${p.userid}, ${p.verifycode}, CDate('${checktimeText}'), ${p.checktype}, ${p.workcode}, ${p.eventType}, '${p.cardNum}', ${p.isreal}${p.idDevice === null ? "" : `, ${p.idDevice}`})
`;

      await connection.execute(insertAuditData);
      await connection.execute(insertDeviceLog);

      inserted.push({index: i, serialno: serialNo, userid: p.userid});
      nextSerialNo = serialNo + 1;
    } catch (error) {
      rejected.push({index: i, error: error.message || "Unknown error"});
    }
  }

  if (inserted.length === 0) {
    return res
      .status(400)
      .json({error: "No punches inserted", rejected, inserted});
  }

  return res.status(201).json({inserted, rejected});
});

function formatDate(dateString) {
  const [year, month, day] = dateString.split("-");
  return `${month}/${day}/${year}`;
}

function toDateKeyEastern(value) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(parsed);
}

function toIsoSecond(value) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }
  return parsed.toISOString().slice(0, 19);
}

async function fetchExternalPunches({startDate, endDate}) {
  if (!externalReportUrl) {
    return [];
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), externalReportTimeoutMs);

  try {
    const headers = {"Content-Type": "application/json"};
    const apiKey = externalReportApiKey || externalReportToken;
    if (apiKey) {
      headers["x-api-key"] = apiKey;
      headers["x-report-api-key"] = apiKey;
    }

    if (externalReportToken) {
      headers.Authorization = `Bearer ${externalReportToken}`;
    }

    const response = await fetch(externalReportUrl, {
      method: "POST",
      headers,
      body: JSON.stringify({
        startDate,
        endDate,
        timezone: "America/New_York",
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(
        `External time punch request failed with status ${response.status}`
      );
    }

    const payload = await response.json();
    const punches = Array.isArray(payload)
      ? payload
      : Array.isArray(payload?.punches)
        ? payload.punches
        : [];

    return punches
      .map(p => {
        const userid = Number.parseInt(p.userid ?? p.employee_userid, 10);
        const punchedAtRaw =
          p.punched_at_utc ??
          p.punchedAtUtc ??
          p.punchedAt ??
          p.timestamp ??
          p.checktime;

        const punchedAt = new Date(punchedAtRaw);

        if (!Number.isFinite(userid) || Number.isNaN(punchedAt.getTime())) {
          return null;
        }

        return {
          userid,
          checktime: punchedAt.toISOString(),
          source: `${p.source || "external"}`,
          sourcePriority: 1,
          sourceEventId: `${
            p.source_event_id ?? p.sourceEventId ?? p.id ?? ""
          }`,
        };
      })
      .filter(Boolean);
  } finally {
    clearTimeout(timeout);
  }
}

async function getUserProfileByUserIds(userIds) {
  const distinct = Array.from(
    new Set(
      userIds
        .map(id => Number.parseInt(id, 10))
        .filter(id => Number.isFinite(id) && id > 0)
    )
  );

  if (!distinct.length) {
    return new Map();
  }

  const inClause = distinct.map(id => `'${id}'`).join(", ");
  const query = `
SELECT u.userid, u.Username, ug.gName
FROM [user] u
INNER JOIN user_group ug ON u.User_Group = ug.id
WHERE u.userid IN (${inClause})
`;

  const rows = await connection.query(query);
  return rows.reduce((acc, row) => {
    acc.set(Number.parseInt(row.userid, 10), {
      Username: row.Username,
      gName: row.gName,
    });
    return acc;
  }, new Map());
}

function dedupeRowsByUserAndTimestamp(rows) {
  const unique = [];
  const seen = new Set();

  rows.forEach(row => {
    const isoSecond = toIsoSecond(row.checktime);
    if (!isoSecond) {
      return;
    }
    const key = `${row.userid}|${isoSecond}`;
    if (seen.has(key)) {
      return;
    }
    seen.add(key);
    unique.push(row);
  });

  return unique;
}

function sortRowsForReport(rows) {
  return [...rows].sort((a, b) => {
    const groupCompare = `${a.gName || ""}`.localeCompare(`${b.gName || ""}`);
    if (groupCompare !== 0) {
      return groupCompare;
    }

    const userCompare =
      Number.parseInt(a.userid, 10) - Number.parseInt(b.userid, 10);
    if (userCompare !== 0) {
      return userCompare;
    }

    const timeCompare = new Date(a.checktime) - new Date(b.checktime);
    if (timeCompare !== 0) {
      return timeCompare;
    }

    const priorityCompare = (a.sourcePriority || 99) - (b.sourcePriority || 99);
    if (priorityCompare !== 0) {
      return priorityCompare;
    }

    return `${a.sourceEventId || ""}`.localeCompare(`${b.sourceEventId || ""}`);
  });
}

function groupData(data) {
  const groupedByGName = data.reduce((acc, item) => {
    if (!acc[item.gName]) {
      acc[item.gName] = {};
    }
    if (!acc[item.gName][item.Username]) {
      acc[item.gName][item.Username] = {userid: item.userid, dates: {}};
    }
    const date =
      (typeof item.AttendDate === "string" && item.AttendDate.split("T")[0]) ||
      toDateKeyEastern(item.AttendDate || item.checktime);

    if (!date) {
      return acc;
    }

    if (!acc[item.gName][item.Username].dates[date]) {
      acc[item.gName][item.Username].dates[date] = [];
    }
    acc[item.gName][item.Username].dates[date].push(item.checktime);
    return acc;
  }, {});

  return groupedByGName;
}

app.get("/api/report", async (req, res) => {
  console.log("report endpoint hit");
  const {startDate, endDate} = req.query; // Assuming dates are received in 'YYYY-MM-DD' format
  const formattedStartDate = formatDate(startDate); // Implement this function to format date
  const formattedEndDate = formatDate(endDate); // Implement this function to format date
  const includeExternal = `${req.query.includeExternal || "true"}` !== "false";

  const query = `SELECT a.idAttendance, u.userid, u.Username, ug.gName, a.AttendDate, a.checktime
FROM ((auditdata a
INNER JOIN [user] u ON a.userid = u.userid)
INNER JOIN user_group ug ON u.User_Group = ug.id)
WHERE a.AttendDate >= CDate('${formattedStartDate}') AND a.AttendDate <= CDate('${formattedEndDate}')
ORDER BY ug.gName, CInt(u.userid), a.AttendDate, a.checktime;
`;

  try {
    const auditRows = await connection.query(query);
    let mergedRows = auditRows.map(row => ({
      ...row,
      source: "fingertec",
      sourcePriority: 0,
      sourceEventId: `audit:${row.idAttendance || ""}`,
    }));

    if (includeExternal) {
      try {
        const externalPunches = await fetchExternalPunches({startDate, endDate});
        const externalUserIds = externalPunches.map(p => p.userid);
        const userProfiles = await getUserProfileByUserIds(externalUserIds);

        const externalRows = externalPunches.map(p => {
          const userProfile = userProfiles.get(p.userid);
          return {
            userid: p.userid,
            Username: userProfile?.Username || `User ${p.userid}`,
            gName: userProfile?.gName || "Unmapped Users",
            AttendDate: toDateKeyEastern(p.checktime),
            checktime: p.checktime,
            source: p.source,
            sourcePriority: p.sourcePriority,
            sourceEventId: p.sourceEventId,
          };
        });

        mergedRows = mergedRows.concat(externalRows);
      } catch (externalError) {
        console.error("External punch merge failed; using auditdata only", {
          error: externalError.message,
        });
      }
    }

    const sortedRows = sortRowsForReport(mergedRows);
    const dedupedRows = dedupeRowsByUserAndTimestamp(sortedRows);
    res.json(groupData(dedupedRows)); // Organize data by gName, Username, and dates
  } catch (error) {
    console.error(error);
    res.status(500).send("Error querying the database");
  }
});

app.get("/api/active-employees", async (req, res) => {
  const {startDate} = req.query;
  const formattedStartDate = formatDate(startDate);

  const query = `
        SELECT userid, Username, gName
        FROM [user] u
        INNER JOIN user_group AS ug ON u.User_Group = ug.id
        WHERE ExpiryDate IS NULL OR CDate(ExpiryDate) >= CDate('${formattedStartDate}')
        ORDER BY u.userid;
    `;

  try {
    const activeEmployees = await connection.query(query);
    res.json(activeEmployees);
  } catch (error) {
    console.error(error);
    res.status(500).send("Error querying the database for active employees");
  }
});

app.get("/api", (req, res) => {
  res.json({message: "Hello from server!"});
});

app.listen(port, () => {
  console.log(`Server listening at http://localhost:${port}`);
});
