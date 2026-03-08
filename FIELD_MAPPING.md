# Field Mapping Reference

## Lead Data Structure

The bot collects beauty/wellness lead information but uses the existing database fields for compatibility. Here's how the fields map:

### Database Field → Beauty/Wellness Context

| Database Field | Beauty/Wellness Use | Example Values |
|----------------|---------------------|----------------|
| `name` | Customer Name | "Priya Sharma" |
| `phone` | Phone Number (auto-captured) | "+919876543210" |
| `vehicle` | **Service Category** | "Hair Treatment", "Weight Loss", "Skin Care" |
| `model` | **Specific Service** | "PRP Hair Treatment", "Hydrafacial", "Body Contouring" |
| `year` | **Preferred Date/Time** | "Next Week", "This Saturday", "ASAP" |
| `location` | Customer Location | "Jayanagar", "Bangalore" |
| `priority` | Booking Urgency | "HIGH", "MEDIUM", "LOW" |
| `enquiryDetails` | Summary of Request | "Interested in PRP treatment for hair fall" |

## Google Sheets Column Headers

When you deploy the Google Apps Script, your sheet will have these columns:

1. **Timestamp** - When the lead was captured
2. **Name** - Customer name
3. **Phone** - Contact number
4. **Service Category** - Type of service (Hair, Skin, Weight Loss, etc.)
5. **Specific Service** - Exact treatment (PRP, Hydrafacial, etc.)
6. **Preferred Date/Time** - When they want to book
7. **Location** - Where they're located
8. **Priority** - HIGH/MEDIUM/LOW urgency
9. **Enquiry Details** - Summary of their needs
10. **Status** - PENDING/CLEAR/REJECTED

## Why This Mapping?

The original system was built for a motorcycle business, so we're reusing the existing fields to avoid breaking the lead collection, follow-up system, and Google Sheets integration. The functionality remains 100% intact - only the labels and context have changed.

## Example Lead Data

```json
{
  "name": "Anjali Reddy",
  "phone": "+919876543210",
  "vehicle": "Hair Treatment",
  "model": "PRP Hair Treatment",
  "year": "Next Week",
  "location": "Jayanagar, Bangalore",
  "priority": "HIGH",
  "enquiryDetails": "Experiencing severe hair fall, interested in PRP treatment"
}
```

This will appear in Google Sheets as:

| Timestamp | Name | Phone | Service Category | Specific Service | Preferred Date/Time | Location | Priority | Enquiry Details | Status |
|-----------|------|-------|------------------|------------------|---------------------|----------|----------|----------------|--------|
| 2024-03-07... | Anjali Reddy | +919876543210 | Hair Treatment | PRP Hair Treatment | Next Week | Jayanagar, Bangalore | HIGH | Experiencing severe hair fall... | PENDING |
