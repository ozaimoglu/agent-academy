package academy.demo;

import org.springframework.stereotype.Service;

@Service
public class OrderService {
    private final OrderWriter writer;

    public OrderService(OrderWriter writer) {
        this.writer = writer;
    }

    public void placeOrder(Order order) {
        writer.persist(order);
    }
}
