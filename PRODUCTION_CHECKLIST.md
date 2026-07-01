# ProfAI Production Deployment Checklist

## Pre-Deployment (Before Committing)

### Security ✅
- [x] Removed exposed API keys
- [x] No secrets in source code
- [ ] **TODO**: Rotate HeyGen API key (it was exposed)
- [x] `.env` properly gitignored
- [x] `.env.local` properly gitignored

### Code Quality ✅
- [x] Build passes (`npm run build`)
- [x] No TypeScript errors
- [x] No console warnings
- [x] No dead code
- [x] No duplicate components

### Dependencies ✅
- [x] Removed unused packages (4)
- [x] All imports resolved
- [x] Package-lock.json updated
- [x] No security vulnerabilities

### Tests ✅
- [x] Build verified working
- [x] All routes accessible
- [x] No broken imports

---

## Pre-Production (Before Going Live)

### Infrastructure
- [ ] Azure Storage account created (for file uploads)
- [ ] PostgreSQL database provisioned (for production DB)
- [ ] Environment variables configured in production
- [ ] CORS properly configured

### Configuration
- [ ] Remove `LOCAL_DEV="true"` from api/.env
- [ ] Set `DATABASE_URL` to production database
- [ ] Set `AZURE_STORAGE_CONNECTION_STRING` (or S3 equivalent)
- [ ] Rotate API keys:
  - [ ] HEYGEN_API_KEY
  - [ ] ELEVENLABS_API_KEY
  - [ ] OPENAI_API_KEY

### Monitoring
- [ ] Set up Sentry error tracking
- [ ] Set up application logging
- [ ] Set up uptime monitoring
- [ ] Set up alerts (Slack/Email)

### Scaling (Phase 1)
- [ ] Implement job queue (Azure Service Bus or Redis)
- [ ] Move file storage to cloud (Azure Blob or AWS S3)
- [ ] Switch from SQLite to PostgreSQL

---

## First Day (After Deployment)

### Smoke Tests
- [ ] Test user registration
- [ ] Test project creation
- [ ] Test file upload (Library)
- [ ] Test script generation
- [ ] Test voice generation
- [ ] Test video generation
- [ ] Test visual designer
- [ ] Test video playback

### Monitoring
- [ ] Check error logs (Sentry)
- [ ] Check performance metrics
- [ ] Check database query times
- [ ] Check storage usage
- [ ] Check CPU/memory usage

### User Communication
- [ ] Notify users the app is live
- [ ] Provide feedback channel
- [ ] Share documentation link
- [ ] Set support response SLA

---

## First Week

### Scaling Decisions
- [ ] Monitor concurrent user count
- [ ] Monitor API response times
- [ ] Monitor storage growth
- [ ] Identify bottlenecks

### First Issues
- [ ] Review bug reports
- [ ] Fix high-priority issues
- [ ] Optimize slow endpoints
- [ ] Document workarounds

### Performance Optimization
- [ ] Analyze slow queries
- [ ] Add database indexes if needed
- [ ] Optimize image sizes
- [ ] Enable CDN for assets

---

## Ongoing (Maintenance)

### Daily
- [ ] Check error tracking dashboard
- [ ] Check uptime status
- [ ] Review user feedback

### Weekly
- [ ] Analyze usage patterns
- [ ] Review performance metrics
- [ ] Plan infrastructure changes if needed
- [ ] Backup databases

### Monthly
- [ ] Review cost breakdown
- [ ] Plan feature releases
- [ ] Security audit
- [ ] Dependency updates

---

## Scaling Timeline

### Week 1: Launch (MVP)
- Single server (local/Azure Functions)
- SQLite database
- Local file storage
- Single process

**Users**: 0-50  
**Status**: MVP, manual scaling only

### Week 2: Phase 1 (Storage Migration)
- Azure Blob Storage implementation
- CDN setup
- Local functions → distributed

**Users**: 50-200  
**Cost**: +$15/mo  
**Effort**: 2-3 hours

### Week 3: Phase 2 (Job Queue)
- Redis/Service Bus job queue
- Background workers for FFmpeg
- Request queue abstraction

**Users**: 200-500  
**Cost**: +$10/mo  
**Effort**: 1-2 days

### Week 4: Phase 3 (Database)
- PostgreSQL migration
- Connection pooling
- Read replicas (optional)

**Users**: 500-2,000  
**Cost**: +$15/mo  
**Effort**: 1 hour

### Month 2+: Expansion
- Multi-server setup (Kubernetes)
- Global CDN
- Database replication
- Advanced monitoring

**Users**: 2,000-100,000  
**Cost**: $2,000+/mo  
**Effort**: Ongoing

---

## Break-Even Points (When to Scale)

| Metric | Action | Timeline |
|--------|--------|----------|
| **100 concurrent users** | Add rate limiting | Immediate |
| **200 concurrent users** | Implement job queue | Week 2 |
| **500 concurrent users** | Switch to PostgreSQL | Week 3 |
| **1,000 concurrent users** | Add second API server | Week 4 |
| **5,000+ concurrent users** | Kubernetes deployment | Month 2 |

---

## Red Flags (When to Intervene)

⚠️ **Immediate Action Needed**:
- [ ] API response time > 5 seconds
- [ ] Error rate > 1%
- [ ] Disk space < 10%
- [ ] Database connections maxed out
- [ ] Monthly bill doubled unexpectedly

🟡 **Watch Closely**:
- [ ] API response time > 2 seconds
- [ ] Error rate > 0.1%
- [ ] Disk space < 25%
- [ ] Cold starts > 3 seconds
- [ ] Storage growth > 50%/month

---

## Rollback Plan

If something breaks in production:

### Easy Rollback (< 30 min)
- [ ] Revert last code deployment
- [ ] Restart API servers
- [ ] Clear CDN cache
- [ ] Notify users

### Database Rollback (< 1 hour)
- [ ] Restore from backup
- [ ] Verify data integrity
- [ ] Rerun migrations
- [ ] Test critical paths

### Data Loss Recovery (Emergency)
- [ ] Contact cloud provider (Azure/AWS)
- [ ] Request recovery from backup
- [ ] Estimate data loss
- [ ] Notify affected users

---

## Documentation Links

Keep these handy:
- [ ] Architecture diagram
- [ ] Deployment runbook
- [ ] Database schema docs
- [ ] API endpoint docs
- [ ] Incident response plan
- [ ] Escalation contacts

---

## Success Metrics (After 1 Month)

Track these to evaluate production health:

- [ ] Uptime: > 99.5%
- [ ] Median response time: < 500ms
- [ ] Error rate: < 0.1%
- [ ] User retention: > 60%
- [ ] Bug report rate: < 1 per 100 users
- [ ] Support response time: < 24 hours

---

## Contact & Escalation

**On-Call Engineer**: (Add your name/contact)  
**Backup**: (Add backup contact)  
**Escalation**: manager@company.com  
**Critical Issues**: Slack #incidents  

---

## Final Pre-Launch Review

- [ ] All items above reviewed
- [ ] Team trained on deployment
- [ ] Rollback procedures tested
- [ ] Monitoring dashboards set up
- [ ] Support team briefed
- [ ] Launch approved ✅

---

**Last Updated**: July 1, 2026  
**Status**: Ready for deployment  
**Approved By**: (Add signature)

