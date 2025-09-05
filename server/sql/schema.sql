-- Multi-Tenant Support Ticket System Schema
-- Updated for CareDesk project with orgAdmin, Agent, Customer roles

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Organizations (Tenants)
CREATE TABLE IF NOT EXISTS organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  domain VARCHAR(255) UNIQUE,
  keycloak_org_id VARCHAR(255) UNIQUE,
  settings JSONB DEFAULT '{}',
  status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'suspended')),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Users (can be orgAdmin, Agent, or Customer)
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  keycloak_id VARCHAR(255) UNIQUE,
  username VARCHAR(255) NOT NULL,
  email VARCHAR(255) NOT NULL,
  first_name VARCHAR(100),
  last_name VARCHAR(100),
  phone VARCHAR(20),
  avatar_url TEXT,
  status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'suspended')),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Organization Users (Role assignments)
CREATE TABLE IF NOT EXISTS organization_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role VARCHAR(20) NOT NULL CHECK (role IN ('orgAdmin', 'Agent', 'Customer')),
  permissions JSONB DEFAULT '{}',
  is_active BOOLEAN DEFAULT true,
  joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(organization_id, user_id)
);

-- Ticket Categories
CREATE TABLE IF NOT EXISTS ticket_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL,
  description TEXT,
  color VARCHAR(7) DEFAULT '#3B82F6',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Ticket Priorities
CREATE TABLE IF NOT EXISTS ticket_priorities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name VARCHAR(50) NOT NULL,
  level INTEGER NOT NULL CHECK (level >= 1 AND level <= 5),
  color VARCHAR(7) DEFAULT '#3B82F6',
  sla_hours INTEGER DEFAULT 24,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Tickets
CREATE TABLE IF NOT EXISTS tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  ticket_number VARCHAR(50) NOT NULL,
  title VARCHAR(255) NOT NULL,
  description TEXT NOT NULL,
  category_id UUID REFERENCES ticket_categories(id),
  priority_id UUID REFERENCES ticket_priorities(id),
  status VARCHAR(20) DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'resolved', 'closed', 'escalated')),
  customer_id UUID NOT NULL REFERENCES users(id),
  assigned_agent_id UUID REFERENCES users(id),
  assigned_by UUID REFERENCES users(id),
  escalated_at TIMESTAMP,
  resolved_at TIMESTAMP,
  closed_at TIMESTAMP,
  due_date TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Ticket Comments
CREATE TABLE IF NOT EXISTS ticket_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id),
  content TEXT NOT NULL,
  is_internal BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Ticket Attachments
CREATE TABLE IF NOT EXISTS ticket_attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  comment_id UUID REFERENCES ticket_comments(id) ON DELETE CASCADE,
  filename VARCHAR(255) NOT NULL,
  original_name VARCHAR(255) NOT NULL,
  file_path TEXT NOT NULL,
  file_size BIGINT NOT NULL,
  mime_type VARCHAR(100) NOT NULL,
  uploaded_by UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Ticket History (Audit Trail)
CREATE TABLE IF NOT EXISTS ticket_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id),
  action VARCHAR(50) NOT NULL,
  field_name VARCHAR(50),
  old_value TEXT,
  new_value TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Agent Availability
CREATE TABLE IF NOT EXISTS agent_availability (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  is_available BOOLEAN DEFAULT true,
  max_tickets INTEGER DEFAULT 10,
  current_tickets INTEGER DEFAULT 0,
  last_active TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, organization_id)
);

-- Escalation Rules
CREATE TABLE IF NOT EXISTS escalation_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL,
  priority_id UUID REFERENCES ticket_priorities(id),
  category_id UUID REFERENCES ticket_categories(id),
  hours_threshold INTEGER NOT NULL,
  action VARCHAR(50) NOT NULL CHECK (action IN ('escalate', 'reassign', 'notify')),
  target_user_id UUID REFERENCES users(id),
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Email Notifications
CREATE TABLE IF NOT EXISTS email_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id),
  type VARCHAR(50) NOT NULL CHECK (type IN ('ticket_created', 'ticket_assigned', 'ticket_updated', 'ticket_resolved', 'comment_added')),
  sent_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  status VARCHAR(20) DEFAULT 'sent' CHECK (status IN ('sent', 'failed', 'pending'))
);

-- Organization Invites
CREATE TABLE IF NOT EXISTS organization_invites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  email VARCHAR(255) NOT NULL,
  role VARCHAR(20) NOT NULL CHECK (role IN ('orgAdmin', 'Agent', 'Customer')),
  invited_by UUID NOT NULL REFERENCES users(id),
  token VARCHAR(255) UNIQUE NOT NULL,
  expires_at TIMESTAMP NOT NULL,
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'expired')),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for Performance
CREATE INDEX IF NOT EXISTS idx_tickets_organization_id ON tickets(organization_id);
CREATE INDEX IF NOT EXISTS idx_tickets_customer_id ON tickets(customer_id);
CREATE INDEX IF NOT EXISTS idx_tickets_assigned_agent_id ON tickets(assigned_agent_id);
CREATE INDEX IF NOT EXISTS idx_tickets_status ON tickets(status);
CREATE INDEX IF NOT EXISTS idx_tickets_created_at ON tickets(created_at);
CREATE INDEX IF NOT EXISTS idx_tickets_ticket_number ON tickets(ticket_number);

CREATE INDEX IF NOT EXISTS idx_organization_users_org_id ON organization_users(organization_id);
CREATE INDEX IF NOT EXISTS idx_organization_users_user_id ON organization_users(user_id);
CREATE INDEX IF NOT EXISTS idx_organization_users_role ON organization_users(role);

CREATE INDEX IF NOT EXISTS idx_ticket_comments_ticket_id ON ticket_comments(ticket_id);
CREATE INDEX IF NOT EXISTS idx_ticket_comments_user_id ON ticket_comments(user_id);

CREATE INDEX IF NOT EXISTS idx_ticket_attachments_ticket_id ON ticket_attachments(ticket_id);
CREATE INDEX IF NOT EXISTS idx_ticket_attachments_comment_id ON ticket_attachments(comment_id);

CREATE INDEX IF NOT EXISTS idx_ticket_history_ticket_id ON ticket_history(ticket_id);
CREATE INDEX IF NOT EXISTS idx_ticket_history_user_id ON ticket_history(user_id);

CREATE INDEX IF NOT EXISTS idx_agent_availability_user_id ON agent_availability(user_id);
CREATE INDEX IF NOT EXISTS idx_agent_availability_org_id ON agent_availability(organization_id);

-- Functions for automatic updates
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Triggers for updated_at
CREATE TRIGGER update_organizations_updated_at BEFORE UPDATE ON organizations FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_organization_users_updated_at BEFORE UPDATE ON organization_users FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_tickets_updated_at BEFORE UPDATE ON tickets FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_ticket_comments_updated_at BEFORE UPDATE ON ticket_comments FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_ticket_categories_updated_at BEFORE UPDATE ON ticket_categories FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_ticket_priorities_updated_at BEFORE UPDATE ON ticket_priorities FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_escalation_rules_updated_at BEFORE UPDATE ON escalation_rules FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_organization_invites_updated_at BEFORE UPDATE ON organization_invites FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Function to generate ticket number
CREATE OR REPLACE FUNCTION generate_ticket_number(org_id UUID)
RETURNS VARCHAR AS $$
DECLARE
    org_prefix VARCHAR(10);
    ticket_count BIGINT;
    ticket_number VARCHAR(50);
BEGIN
    -- Get organization prefix (first 3 letters of org name)
    SELECT UPPER(LEFT(name, 3)) INTO org_prefix 
    FROM organizations 
    WHERE id = org_id;
    
    -- Get count of tickets for this organization
    SELECT COUNT(*) INTO ticket_count 
    FROM tickets 
    WHERE organization_id = org_id;
    
    -- Generate ticket number: ORG-YYYYMMDD-XXXX
    ticket_number := org_prefix || '-' || TO_CHAR(CURRENT_DATE, 'YYYYMMDD') || '-' || LPAD((ticket_count + 1)::TEXT, 4, '0');
    
    RETURN ticket_number;
END;
$$ LANGUAGE plpgsql;

-- Function to update agent ticket count
CREATE OR REPLACE FUNCTION update_agent_ticket_count()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        -- Increment current_tickets when ticket is assigned
        IF NEW.assigned_agent_id IS NOT NULL THEN
            UPDATE agent_availability 
            SET current_tickets = current_tickets + 1,
                updated_at = CURRENT_TIMESTAMP
            WHERE user_id = NEW.assigned_agent_id 
            AND organization_id = NEW.organization_id;
        END IF;
    ELSIF TG_OP = 'UPDATE' THEN
        -- Handle reassignment
        IF OLD.assigned_agent_id IS DISTINCT FROM NEW.assigned_agent_id THEN
            -- Decrement old agent's count
            IF OLD.assigned_agent_id IS NOT NULL THEN
                UPDATE agent_availability 
                SET current_tickets = GREATEST(current_tickets - 1, 0),
                    updated_at = CURRENT_TIMESTAMP
                WHERE user_id = OLD.assigned_agent_id 
                AND organization_id = OLD.organization_id;
            END IF;
            
            -- Increment new agent's count
            IF NEW.assigned_agent_id IS NOT NULL THEN
                UPDATE agent_availability 
                SET current_tickets = current_tickets + 1,
                    updated_at = CURRENT_TIMESTAMP
                WHERE user_id = NEW.assigned_agent_id 
                AND organization_id = NEW.organization_id;
            END IF;
        END IF;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for agent ticket count
CREATE TRIGGER update_agent_ticket_count_trigger
    AFTER INSERT OR UPDATE ON tickets
    FOR EACH ROW
    EXECUTE FUNCTION update_agent_ticket_count();

-- Insert default priorities for new organizations
CREATE OR REPLACE FUNCTION create_default_priorities()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO ticket_priorities (organization_id, name, level, color, sla_hours) VALUES
    (NEW.id, 'Low', 1, '#10B981', 72),
    (NEW.id, 'Medium', 2, '#F59E0B', 48),
    (NEW.id, 'High', 3, '#EF4444', 24),
    (NEW.id, 'Critical', 4, '#DC2626', 4),
    (NEW.id, 'Emergency', 5, '#7C2D12', 1);
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to create default priorities
CREATE TRIGGER create_default_priorities_trigger
    AFTER INSERT ON organizations
    FOR EACH ROW
    EXECUTE FUNCTION create_default_priorities();
