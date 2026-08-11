import prisma from '../lib/prisma'


/**
 * 检查项目是否已归档
 * @param projectId 项目ID
 * @returns 是否已归档
 */
export async function checkProjectArchived(projectId: number | null): Promise<boolean> {
  if (!projectId) return false // 没有关联项目，不限制
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { isArchived: true }
  })
  return project?.isArchived || false
}

/**
 * 通过合同ID检查关联的项目是否已归档
 * @param contractId 合同ID
 * @returns 是否已归档
 */
export async function checkContractProjectArchived(contractId: number): Promise<boolean> {
  const contract = await prisma.contract.findUnique({
    where: { id: contractId },
    select: { projectId: true }
  })
  if (!contract?.projectId) return false
  return await checkProjectArchived(contract.projectId)
}
