import React from 'react';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import OrderCard from './OrderCard';
import { Badge } from '@/components/ui/badge';

const COLUMNS = [
  { id: 'pending', label: 'New', color: 'bg-amber-100 text-amber-700' },
  { id: 'confirmed', label: 'Confirmed', color: 'bg-blue-100 text-blue-700' },
  { id: 'preparing', label: 'Preparing', color: 'bg-purple-100 text-purple-700' },
  { id: 'ready', label: 'Ready', color: 'bg-green-100 text-green-700' },
  { id: 'served', label: 'Completed', color: 'bg-slate-100 text-slate-700' },
];

export default function OrderKanban({ orders, onStatusChange, onOrderClick, currency }) {
  const handleDragEnd = (result) => {
    const { destination, draggableId } = result;
    if (!destination) return;

    const orderId = draggableId;
    const newStatus = destination.droppableId;

    onStatusChange(orderId, newStatus);
  };

  const getOrdersByStatus = (status) => {
    return orders.filter(order => order.status === status);
  };

  return (
    <DragDropContext onDragEnd={handleDragEnd}>
      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4">
        {COLUMNS.map((column) => {
          const columnOrders = getOrdersByStatus(column.id);
          return (
            <div key={column.id} className="flex flex-col">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="font-semibold text-slate-900">{column.label}</h3>
                <Badge className={column.color}>{columnOrders.length}</Badge>
              </div>

              <Droppable droppableId={column.id}>
                {(provided, snapshot) => (
                  <div
                    ref={provided.innerRef}
                    {...provided.droppableProps}
                    className={`flex-1 space-y-3 p-3 rounded-xl border-2 border-dashed min-h-[200px] transition-colors ${
                      snapshot.isDraggingOver 
                        ? 'border-[rgb(var(--color-primary))] bg-[rgb(var(--color-primary-50))]' 
                        : 'border-slate-200 bg-slate-50'
                    }`}
                  >
                    {columnOrders.map((order, index) => (
                      <Draggable key={order.id} draggableId={order.id} index={index}>
                        {(provided, snapshot) => (
                          <div
                            ref={provided.innerRef}
                            {...provided.draggableProps}
                            {...provided.dragHandleProps}
                            style={{
                              ...provided.draggableProps.style,
                              opacity: snapshot.isDragging ? 0.8 : 1,
                            }}
                          >
                            <OrderCard
                              order={order}
                              onStatusChange={onStatusChange}
                              onClick={() => onOrderClick(order)}
                              currency={currency}
                            />
                          </div>
                        )}
                      </Draggable>
                    ))}
                    {provided.placeholder}
                  </div>
                )}
              </Droppable>
            </div>
          );
        })}
      </div>
    </DragDropContext>
  );
}