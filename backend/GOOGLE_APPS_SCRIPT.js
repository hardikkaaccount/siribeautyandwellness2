// ============================================================
// GOOGLE APPS SCRIPT — Paste this into script.google.com
// ============================================================
// STEPS:
// 1. Go to https://script.google.com
// 2. Click "New Project"
// 3. Delete all default code
// 4. Paste this ENTIRE file
// 5. Click "Deploy" → "New Deployment"
// 6. Type = "Web App"
// 7. Execute as = "Me"
// 8. Who has access = "Anyone"
// 9. Click "Deploy" → Copy the URL
// 10. Paste the URL in your .env file as GOOGLE_SHEET_URL
// ============================================================
// 
// FIELD MAPPING (Beauty & Wellness):
// - vehicle → Service Category (e.g., "Hair Treatment", "Weight Loss")
// - model → Specific Service (e.g., "PRP Hair Treatment", "Hydrafacial")
// - year → Preferred Date/Time (e.g., "Next Week", "This Saturday")
// ============================================================

function doPost(e) {
  try {
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
    var data = JSON.parse(e.postData.contents);
    
    // NEW: Action 'updateStatus'
    if (data.action === 'updateStatus') {
      var dataRange = sheet.getDataRange();
      var values = dataRange.getValues();
      var headers = values[0];
      var phoneIdx = headers.indexOf('Phone');
      var statusIdx = headers.indexOf('Status');
      
      var targetPhone = String(data.phone).replace(/[^0-9]/g, '');

      for (var i = 1; i < values.length; i++) {
        var rowPhone = String(values[i][phoneIdx]).replace(/[^0-9]/g, '');
        if (rowPhone === targetPhone) {
            // Update the status cell
            sheet.getRange(i + 1, statusIdx + 1).setValue(data.status);
            return ContentService.createTextOutput(JSON.stringify({ success: true }))
                .setMimeType(ContentService.MimeType.JSON);
        }
      }
      return ContentService.createTextOutput(JSON.stringify({ error: 'Phone not found in sheet' }))
            .setMimeType(ContentService.MimeType.JSON);
    }

    // DEFAULT BEHAVIOR: Add new lead if sheet is empty, add headers first
    if (sheet.getLastRow() === 0) {
      sheet.appendRow([
        'Timestamp',
        'Name', 
        'Phone',
        'Service Category',
        'Specific Service',
        'Preferred Date/Time',
        'Location',
        'Priority',
        'Enquiry Details',
        'Status'
      ]);
    }
    
    sheet.appendRow([
      new Date().toISOString(),
      data.name || '',
      data.phone || '',
      data.vehicle || '',
      data.model || '',
      data.year || '',
      data.location || '',
      data.priority || '',
      data.enquiryDetails || '',
      'PENDING' // Default status
    ]);
    
    return ContentService
      .createTextOutput(JSON.stringify({ status: 'success' }))
      .setMimeType(ContentService.MimeType.JSON);
      
  } catch (error) {
    return ContentService
      .createTextOutput(JSON.stringify({ status: 'error', message: error.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function testAppend() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  sheet.appendRow([
    new Date().toISOString(),
    'Test User',
    '+911234567890',
    'Hair Treatment',
    'PRP Hair Treatment',
    'Next Week',
    'Bangalore',
    'HIGH',
    'Interested in PRP treatment for hair fall',
    'PENDING'
  ]);
}

// Handles GET requests
function doGet(e) {
  try {
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
    var dataRange = sheet.getDataRange();
    var values = dataRange.getValues();
    
    if (values.length <= 1) {
      return ContentService.createTextOutput(JSON.stringify([]))
        .setMimeType(ContentService.MimeType.JSON);
    }
    
    var headers = values[0];
    var phoneIdx = headers.indexOf('Phone');
    var statusIdx = headers.indexOf('Status');
    
    if (phoneIdx === -1 || statusIdx === -1) {
       return ContentService.createTextOutput(JSON.stringify({ error: 'Missing Phone or Status columns' }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    // NEW: If action=getAll, return the entire spreadsheet as a JSON array
    if (e.parameter && e.parameter.action === 'getAll') {
        var allLeads = [];
        for (var i = 1; i < values.length; i++) {
            var row = values[i];
            var obj = {};
            for (var j = 0; j < headers.length; j++) {
                // Exact mapping to frontend expected keys
                var headerVal = String(headers[j]).trim();
                var key = headerVal.toLowerCase().replace(/\s+/g, '');
                
                if (headerVal === 'Timestamp') key = 'createdAt';
                else if (headerVal === 'Enquiry Details') key = 'enquiryDetails';
                else if (headerVal === 'Name') key = 'name';
                else if (headerVal === 'Phone') key = 'phone';
                else if (headerVal === 'Vehicle') key = 'vehicle';
                else if (headerVal === 'Model') key = 'model';
                else if (headerVal === 'Year') key = 'year';
                else if (headerVal === 'Location') key = 'location';
                else if (headerVal === 'Priority') key = 'priority';
                else if (headerVal === 'Status') key = 'status';
                
                obj[key] = row[j];
            }
            allLeads.push(obj);
        }
        return ContentService
          .createTextOutput(JSON.stringify(allLeads))
          .setMimeType(ContentService.MimeType.JSON);
    }
    
    // DEFAULT BEHAVIOR: 2-Way Sync (Check for CLEAR/REJECTED)
    var statuses = [];
    
    for (var i = 1; i < values.length; i++) {
        var row = values[i];
        var status = row[statusIdx];
        if (status === 'CLEAR' || status === 'REJECTED') {
            statuses.push({
                phone: row[phoneIdx],
                status: status,
                row: i + 1 // Keep track of row to mark as synced later
            });
            // Auto-mark as synced so we don't return it again next time
            sheet.getRange(i + 1, statusIdx + 1).setValue(status + '_SYNCED');
        }
    }
    
    return ContentService
      .createTextOutput(JSON.stringify(statuses))
      .setMimeType(ContentService.MimeType.JSON);
      
  } catch (error) {
    return ContentService
      .createTextOutput(JSON.stringify({ error: error.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}
