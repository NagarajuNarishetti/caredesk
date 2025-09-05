# CareDesk Database Setup Guide

This directory contains the database schema and setup files for the CareDesk multi-tenant support ticket system.

## Files Overview

### 1. `schema.sql`
The main database schema file containing all tables, indexes, triggers, and functions for the ticket system.

**Key Features:**
- Multi-tenant organization support
- Role-based access control (orgAdmin, Agent, Customer)
- Ticket management with categories and priorities
- Comment system with internal/external comments
- File attachment support
- Agent availability tracking
- Escalation rules
- Email notification tracking
- Audit trail (ticket history)

> Note: Sample data has been removed to avoid accidental inserts into running environments.

## Setup Instructions

### Option 1: Fresh Installation (Recommended for new projects)

1. **Create the database:**
   ```sql
   CREATE DATABASE caredeskdb;
   ```

2. **Run the main schema:**
   ```bash
   psql -d caredeskdb -f schema.sql
   ```

3. Skip sample data (intentionally removed).

> Note: The previous one-off migration script has been removed to keep the project lean. For existing custom deployments, adapt your own migration as needed.

## Database Structure

### Core Tables

#### Organizations (Tenants)
- `organizations`: Multi-tenant organizations
- `organization_users`: User role assignments within organizations

#### Users
- `users`: User accounts with Keycloak integration
- `agent_availability`: Agent workload tracking

#### Tickets
- `tickets`: Main ticket records
- `ticket_categories`: Ticket categorization
- `ticket_priorities`: Priority levels with SLA
- `ticket_comments`: Ticket communication
- `ticket_attachments`: File attachments
- `ticket_history`: Audit trail

#### Support Features
- `escalation_rules`: Automated escalation configuration
- `email_notifications`: Email tracking
- `organization_invites`: User invitation system

## Role Mapping

The system uses these roles (mapped from Keycloak):
- `orgAdmin` (was 'owner'): Organization administrators
- `Agent` (was 'reviewer'): Support agents
- `Customer` (was 'viewer'): End customers

## Key Features

### Multi-Tenancy
- Each organization has isolated data
- Users can belong to multiple organizations with different roles
- Organization-specific settings and configurations

### Ticket Management
- Automatic ticket number generation (ORG-YYYYMMDD-XXXX format)
- Status tracking: open → in_progress → resolved → closed
- Priority-based SLA tracking
- Category-based organization

### Agent Assignment
- Round-robin or least-active assignment algorithms
- Agent availability tracking
- Workload balancing
- Escalation rules

### File Management
- Attachment support for tickets and comments
- MinIO integration for file storage
- File metadata tracking

### Notifications
- Email notification tracking
- Status change notifications
- Comment notifications

## Environment Variables

Make sure your `.env` file contains the correct database configuration:

```env
DB_HOST=localhost
DB_PORT=5432
DB_NAME=caredeskdb
DB_USER=caredeskuser
DB_PASSWORD=caredeskpass
```

## Testing the Setup

After running the schema, you can test the setup:

```sql
-- Check organizations
SELECT * FROM organizations;

-- Check users and their roles
SELECT u.username, u.email, ou.role, o.name as organization
FROM users u
JOIN organization_users ou ON u.id = ou.user_id
JOIN organizations o ON ou.organization_id = o.id;

-- Check tickets
SELECT t.ticket_number, t.title, t.status, u.username as customer, o.name as organization
FROM tickets t
JOIN users u ON t.customer_id = u.id
JOIN organizations o ON t.organization_id = o.id;
```

## Next Steps

1. Update your server routes to use the new schema
2. Update your client components to work with tickets instead of media
3. Configure Keycloak roles to match the new role names
4. Set up MinIO for file attachments
5. Configure email notifications
6. Set up escalation rules for your organizations
