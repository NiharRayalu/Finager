async function fetchCSVData() {
    try {
      const response = await fetch('sample_extracted_data.csv');
      if (!response.ok) {
        throw new Error('Network response was not ok');
      }
      const data = await response.text();
      console.log('Raw CSV Data:', data); // Debug raw CSV
      const rows = data.split('\n').filter(row => row.trim() !== '');
      console.log('Rows:', rows); // Debug rows
      const monthlyData = {};
      let totalAmount = 0;
      let totalTransactions = 0;
      rows.forEach((row, index) => {
        if (index === 0 || row.includes('Unknown')) {
          console.warn(`Skipping row ${index} (header or contains 'Unknown'):`, row);
          return; // Skip header and invalid rows
        }
        const columns = row.split(',');
        console.log(`Row ${index} columns:`, columns);
        if (columns.length < 4) {
          console.warn(`Skipping row ${index} (less than 4 columns):`, row);
          return;
        }
        const date = columns[0].replace(/"/g, '').trim();
        const amount = columns[3].replace(/"/g, '').trim();
        console.log(`Processing row ${index}: date=${date}, amount=${amount}`);
        if (!date || amount === '' || isNaN(amount)) {
          console.warn(`Skipping row ${index} (invalid date or amount):`, row);
          return;
        }
        const parsedDate = new Date(date);
        console.log(`Parsed date for row ${index}:`, parsedDate);
        if (isNaN(parsedDate.getTime())) { // use getTime() to validate the date
          console.warn(`Skipping row ${index} (invalid parsed date):`, date);
          return;
        }
        const monthYear = parsedDate.toLocaleString('en-US', { month: 'short', year: 'numeric' });
        console.log(`Processed month-year: ${monthYear}, amount: ${amount}`); // Debug processed data
        monthlyData[monthYear] = (monthlyData[monthYear] || 0) + parseFloat(amount);
        totalAmount += parseFloat(amount);
        totalTransactions++;
      });
      console.log('Final Monthly Data:', monthlyData); // Debug final data
      return {
        labels: Object.keys(monthlyData),
        amounts: Object.values(monthlyData),
        totalAmount,
        totalTransactions,
      };
    } catch (error) {
      console.error('Error:', error);
      alert('Error loading CSV file. Check console for details.');
      return {
        labels: [],
        amounts: [],
        totalAmount: 0,
        totalTransactions: 0,
      };
    }
  }
  
  async function renderChart() {
    const { labels, amounts, totalAmount, totalTransactions } = await fetchCSVData();
    console.log('Labels:', labels);
    console.log('Amounts:', amounts);
    if (labels.length === 0 || amounts.length === 0) {
      alert('No data available to plot.');
      return;
    }
    const ctx = document.getElementById('barChart').getContext('2d');
    new Chart(ctx, {
      type: 'bar',
      data: {
        labels: labels,
        datasets: [{
          label: 'Monthly Expenses',
          data: amounts,
          backgroundColor: '#4e73df',
          borderColor: 'white',
          borderWidth: 1,
        }],
      },
      options: {
        responsive: true,
        scales: {
          x: {
            title: {
              display: true,
              text: 'Months',
              backgroundColor:'#4e73df',
            }
          },
          y: {
            title: {
              display: true,
              text: 'Amount'
            },
            beginAtZero: true
          },
        },
        plugins: {
          legend: {
            display: false
          },
        },
      },
    });
    document.querySelector('.details p:nth-child(1) span').textContent = `₹${totalAmount.toFixed(2)}`;
    document.querySelector('.details p:nth-child(2) span').textContent = totalTransactions;
  }
  
  // Render chart
  renderChart();
  
