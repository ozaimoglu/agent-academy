package academy.demo;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class OrderWriter {
    private final OrderRepository repository;

    public OrderWriter(OrderRepository repository) {
        this.repository = repository;
    }

    @Transactional
    public void persist(Order order) {
        repository.save(order);
        throw new IllegalStateException("Exercise rollback boundary");
    }
}
