// Keep the committed review mounted until the todo read has actually succeeded.
export async function refreshAfterProductionPhotoReview({ readTodos, refreshDetail }) {
  const result = await readTodos();
  if (result?.source !== 'api' || result.blocked) {
    throw new Error('审核已保存，但待办刷新失败，请重新读取结果。');
  }
  refreshDetail();
  return result;
}
