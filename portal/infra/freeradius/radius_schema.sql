-- =====================================================
-- FreeRADIUS MySQL Schema for TurboNet
-- Run this on your MySQL database
-- =====================================================

-- RADIUS authentication table (user credentials)
CREATE TABLE IF NOT EXISTS radcheck (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT,
    username VARCHAR(64) NOT NULL DEFAULT '',
    attribute VARCHAR(64) NOT NULL DEFAULT '',
    op CHAR(2) NOT NULL DEFAULT ':=',
    value VARCHAR(253) NOT NULL DEFAULT '',
    PRIMARY KEY (id),
    INDEX username (username(32))
) ENGINE=InnoDB;

-- RADIUS reply attributes (session settings)
CREATE TABLE IF NOT EXISTS radreply (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT,
    username VARCHAR(64) NOT NULL DEFAULT '',
    attribute VARCHAR(64) NOT NULL DEFAULT '',
    op CHAR(2) NOT NULL DEFAULT '=',
    value VARCHAR(253) NOT NULL DEFAULT '',
    PRIMARY KEY (id),
    INDEX username (username(32))
) ENGINE=InnoDB;

-- User groups
CREATE TABLE IF NOT EXISTS radgroupcheck (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT,
    groupname VARCHAR(64) NOT NULL DEFAULT '',
    attribute VARCHAR(64) NOT NULL DEFAULT '',
    op CHAR(2) NOT NULL DEFAULT ':=',
    value VARCHAR(253) NOT NULL DEFAULT '',
    PRIMARY KEY (id),
    INDEX groupname (groupname(32))
) ENGINE=InnoDB;

-- Group reply attributes
CREATE TABLE IF NOT EXISTS radgroupreply (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT,
    groupname VARCHAR(64) NOT NULL DEFAULT '',
    attribute VARCHAR(64) NOT NULL DEFAULT '',
    op CHAR(2) NOT NULL DEFAULT '=',
    value VARCHAR(253) NOT NULL DEFAULT '',
    PRIMARY KEY (id),
    INDEX groupname (groupname(32))
) ENGINE=InnoDB;

-- User to group mapping
CREATE TABLE IF NOT EXISTS radusergroup (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT,
    username VARCHAR(64) NOT NULL DEFAULT '',
    groupname VARCHAR(64) NOT NULL DEFAULT '',
    priority INT NOT NULL DEFAULT 1,
    PRIMARY KEY (id),
    INDEX username (username(32))
) ENGINE=InnoDB;

-- Accounting table (session tracking)
CREATE TABLE IF NOT EXISTS radacct (
    radacctid BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    acctsessionid VARCHAR(64) NOT NULL DEFAULT '',
    acctuniqueid VARCHAR(32) NOT NULL DEFAULT '',
    username VARCHAR(64) NOT NULL DEFAULT '',
    realm VARCHAR(64) DEFAULT '',
    nasipaddress VARCHAR(15) NOT NULL DEFAULT '',
    nasportid VARCHAR(32) DEFAULT NULL,
    nasporttype VARCHAR(32) DEFAULT NULL,
    acctstarttime DATETIME NULL DEFAULT NULL,
    acctupdatetime DATETIME NULL DEFAULT NULL,
    acctstoptime DATETIME NULL DEFAULT NULL,
    acctinterval INT DEFAULT NULL,
    acctsessiontime INT UNSIGNED DEFAULT NULL,
    acctauthentic VARCHAR(32) DEFAULT NULL,
    connectinfo_start VARCHAR(128) DEFAULT NULL,
    connectinfo_stop VARCHAR(128) DEFAULT NULL,
    acctinputoctets BIGINT DEFAULT NULL,
    acctoutputoctets BIGINT DEFAULT NULL,
    calledstationid VARCHAR(50) NOT NULL DEFAULT '',
    callingstationid VARCHAR(50) NOT NULL DEFAULT '',
    acctterminatecause VARCHAR(32) NOT NULL DEFAULT '',
    servicetype VARCHAR(32) DEFAULT NULL,
    framedprotocol VARCHAR(32) DEFAULT NULL,
    framedipaddress VARCHAR(15) NOT NULL DEFAULT '',
    framedipv6address VARCHAR(45) NOT NULL DEFAULT '',
    framedipv6prefix VARCHAR(45) NOT NULL DEFAULT '',
    framedinterfaceid VARCHAR(44) NOT NULL DEFAULT '',
    delegatedipv6prefix VARCHAR(45) NOT NULL DEFAULT '',
    class VARCHAR(64) DEFAULT NULL,
    PRIMARY KEY (radacctid),
    UNIQUE KEY acctuniqueid (acctuniqueid),
    INDEX username (username),
    INDEX framedipaddress (framedipaddress),
    INDEX framedipv6address (framedipv6address),
    INDEX framedipv6prefix (framedipv6prefix),
    INDEX framedinterfaceid (framedinterfaceid),
    INDEX delegatedipv6prefix (delegatedipv6prefix),
    INDEX acctsessionid (acctsessionid),
    INDEX acctsessiontime (acctsessiontime),
    INDEX acctstarttime (acctstarttime),
    INDEX acctinterval (acctinterval),
    INDEX acctstoptime (acctstoptime),
    INDEX nasipaddress (nasipaddress),
    INDEX callingstationid (callingstationid)
) ENGINE=InnoDB;

-- Post-auth logging
CREATE TABLE IF NOT EXISTS radpostauth (
    id INT NOT NULL AUTO_INCREMENT,
    username VARCHAR(64) NOT NULL DEFAULT '',
    pass VARCHAR(64) NOT NULL DEFAULT '',
    reply VARCHAR(32) NOT NULL DEFAULT '',
    authdate TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    class VARCHAR(64) DEFAULT NULL,
    PRIMARY KEY (id),
    INDEX username (username),
    INDEX class (class)
) ENGINE=InnoDB;

-- NAS (Network Access Server) table
CREATE TABLE IF NOT EXISTS nas (
    id INT NOT NULL AUTO_INCREMENT,
    nasname VARCHAR(128) NOT NULL,
    shortname VARCHAR(32),
    type VARCHAR(30) DEFAULT 'other',
    ports INT,
    secret VARCHAR(60) NOT NULL DEFAULT 'secret',
    server VARCHAR(64),
    community VARCHAR(50),
    description VARCHAR(200) DEFAULT 'RADIUS Client',
    PRIMARY KEY (id),
    INDEX nasname (nasname)
) ENGINE=InnoDB;

-- =====================================================
-- Sample data: Create a test user
-- =====================================================
-- INSERT INTO radcheck (username, attribute, op, value) 
-- VALUES ('testuser', 'Cleartext-Password', ':=', 'testpass');

-- INSERT INTO radreply (username, attribute, op, value)
-- VALUES ('testuser', 'Session-Timeout', '=', '3600');
