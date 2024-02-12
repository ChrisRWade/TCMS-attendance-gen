// DateSelector.js
import React from "react";
import styles from "./DateSelector.module.css";

const DateSelector = ({
  startDate,
  endDate,
  onStartDateChange,
  onEndDateChange,
}) => {
  return (
    <div>
      <input
        type="date"
        value={startDate}
        onChange={(e) => onStartDateChange(e.target.value)}
        className={styles.noPrint}
      />
      <input
        type="date"
        value={endDate}
        onChange={(e) => onEndDateChange(e.target.value)}
        className={styles.noPrint}
      />
    </div>
  );
};

export default DateSelector;
