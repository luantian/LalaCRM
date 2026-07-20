import { Router, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { authenticateToken, AuthRequest } from '../middleware/auth';
import { logOperation } from '../middleware/logOperation';
import logger from '../utils/logger';

const router = Router();
const prisma = new PrismaClient();

// GET /?customerId=x - List contacts for a customer
router.get('/', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const { customerId } = req.query;

    if (!customerId) {
      return res.status(400).json({ error: 'customerId is required' });
    }

    const contacts = await prisma.customerContact.findMany({
      where: { customerId: Number(customerId), deletedAt: null },
      orderBy: [{ isPrimary: 'desc' }, { createdAt: 'desc' }],
    });

    res.json(contacts);
  } catch (error) {
    logger.error('Error fetching customer contacts:', error);
    res.status(500).json({ error: 'Failed to fetch customer contacts' });
  }
});

// POST / - Create contact
router.post('/', authenticateToken, logOperation('客户联系人', 'CREATE'), async (req: AuthRequest, res: Response) => {
  try {
    const { customerId, name, title, phone, email, isPrimary, notes } = req.body;

    if (!customerId || !name) {
      return res.status(400).json({ error: 'customerId and name are required' });
    }

    const contact = await prisma.customerContact.create({
      data: {
        customerId: Number(customerId),
        name,
        title,
        phone,
        email,
        isPrimary: isPrimary ?? false,
        notes,
      },
    });

    res.status(201).json(contact);
  } catch (error) {
    logger.error('Error creating customer contact:', error);
    res.status(500).json({ error: 'Failed to create customer contact' });
  }
});

// PUT /:id - Update contact
router.put('/:id', authenticateToken, logOperation('客户联系人', 'UPDATE'), async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { name, title, phone, email, isPrimary, notes } = req.body;

    const existing = await prisma.customerContact.findFirst({ where: { id: Number(id), deletedAt: null } });
    if (!existing) {
      return res.status(404).json({ error: 'Contact not found' });
    }

    const contact = await prisma.customerContact.update({
      where: { id: Number(id) },
      data: {
        ...(name !== undefined && { name }),
        ...(title !== undefined && { title }),
        ...(phone !== undefined && { phone }),
        ...(email !== undefined && { email }),
        ...(isPrimary !== undefined && { isPrimary }),
        ...(notes !== undefined && { notes }),
      },
    });

    res.json(contact);
  } catch (error) {
    logger.error('Error updating customer contact:', error);
    res.status(500).json({ error: 'Failed to update customer contact' });
  }
});

// DELETE /:id - Delete contact
router.delete('/:id', authenticateToken, logOperation('客户联系人', 'DELETE'), async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    const existing = await prisma.customerContact.findFirst({ where: { id: Number(id), deletedAt: null } });
    if (!existing) {
      return res.status(404).json({ error: 'Contact not found' });
    }

    await prisma.customerContact.update({ where: { id: Number(id) }, data: { deletedAt: new Date() } });

    res.json({ message: 'Contact deleted successfully' });
  } catch (error) {
    logger.error('Error deleting customer contact:', error);
    res.status(500).json({ error: 'Failed to delete customer contact' });
  }
});

// POST /:id/set-primary - Set as primary contact
router.post('/:id/set-primary', authenticateToken, logOperation('客户联系人', 'UPDATE'), async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    const existing = await prisma.customerContact.findFirst({ where: { id: Number(id), deletedAt: null } });
    if (!existing) {
      return res.status(404).json({ error: 'Contact not found' });
    }

    // Unset all other primary contacts for this customer
    await prisma.customerContact.updateMany({
      where: { customerId: existing.customerId, deletedAt: null },
      data: { isPrimary: false },
    });

    // Set this contact as primary
    const contact = await prisma.customerContact.update({
      where: { id: Number(id) },
      data: { isPrimary: true },
    });

    res.json(contact);
  } catch (error) {
    logger.error('Error setting primary contact:', error);
    res.status(500).json({ error: 'Failed to set primary contact' });
  }
});

export default router;
